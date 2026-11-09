import { addresses, cities, provinces } from '@infra/db-drizzle/schema';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgTable } from 'drizzle-orm/pg-core';
import { AnyPgColumn, getTableConfig } from 'drizzle-orm/pg-core';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const LocationSourceSchema = z
  .array(
    z
      .object({
        id: z.number().int().positive(),
        name: z.string().trim().min(1).max(100),
        cities: z.array(
          z
            .object({
              id: z.number().int().positive(),
              name: z.string().trim().min(1).max(100),
            })
            .strict(),
        ),
      })
      .strict(),
  )
  .min(1)
  .superRefine((locations, ctx) => {
    const provinceIds = new Set<number>();
    const cityIds = new Set<number>();

    locations.forEach((province, provinceIndex) => {
      if (provinceIds.has(province.id)) {
        ctx.addIssue({
          code: 'custom',
          path: [provinceIndex, 'id'],
          message: `Duplicate province id: ${province.id}`,
        });
      }
      provinceIds.add(province.id);

      province.cities.forEach((city, cityIndex) => {
        if (cityIds.has(city.id)) {
          ctx.addIssue({
            code: 'custom',
            path: [provinceIndex, 'cities', cityIndex, 'id'],
            message: `Duplicate city id: ${city.id}`,
          });
        }
        cityIds.add(city.id);
      });
    });
  });

type LocationSource = z.infer<typeof LocationSourceSchema>;

const BATCH_SIZE = 1000;
const SEED_LOCK_KEY = 'seed:locations';

type ProvinceRow = { id: number; name: string };
type CityRow = { id: number; name: string; provinceId: number };

export interface SeedLocationsResult {
  provinces: number;
  cities: number;
}

@Injectable()
export class LocationsSeeder {
  private readonly logger = new Logger(LocationsSeeder.name);

  constructor(
    @InjectDrizzle()
    private readonly db: NodePgDatabase,
  ) {}

  async seed(data: unknown): Promise<SeedLocationsResult> {
    const parsed = LocationSourceSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(
        `Invalid locations data:\n${z.prettifyError(parsed.error)}`,
      );
    }

    const { provinceRows, cityRows } = this.toRows(parsed.data);

    await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${SEED_LOCK_KEY}))`,
      );

      const existingProvinces = await tx
        .select({ id: provinces.id, name: provinces.name })
        .from(provinces);
      const sourceNames = new Set(provinceRows.map(({ name }) => name));
      const existingByName = new Map<
        string,
        (typeof existingProvinces)[number]
      >();

      for (const province of existingProvinces) {
        const name = normalizeLocationName(province.name);
        if (!sourceNames.has(name)) continue;
        if (existingByName.has(name)) {
          throw new Error(
            `Multiple existing provinces normalize to "${name}"; resolve the duplicate before seeding`,
          );
        }
        existingByName.set(name, province);
      }

      const managedProvinces = provinceRows.flatMap((province) => {
        const existing = existingByName.get(province.name);
        return existing ? [{ ...existing, targetId: province.id }] : [];
      });
      const managedIds = new Set(managedProvinces.map(({ id }) => id));
      const existingById = new Map(
        existingProvinces.map((province) => [province.id, province]),
      );

      for (const { id, name } of provinceRows) {
        const existing = existingById.get(id);
        if (existing && !managedIds.has(existing.id)) {
          throw new Error(
            `Cannot seed province "${name}" with id ${id}: that id belongs to existing province "${existing.name}", which is not in the seed data`,
          );
        }
      }

      const provinceIdsNeedReconciliation = managedProvinces.some(
        ({ id, targetId }) => id !== targetId,
      );

      if (provinceIdsNeedReconciliation) {
        const maxExistingId = Math.max(
          ...existingProvinces.map(({ id }) => id),
          ...provinceRows.map(({ id }) => id),
        );
        const maxTemporaryId = maxExistingId + managedProvinces.length;
        if (maxTemporaryId > 2_147_483_647) {
          throw new Error(
            'Cannot reconcile province IDs: no temporary integer IDs are available',
          );
        }

        const temporaryProvinces = managedProvinces.map((province, index) => ({
          id: maxExistingId + index + 1,
          name: `__locations_seed_${randomUUID()}_${index}`,
          oldId: province.id,
          targetId: province.targetId,
        }));

        await tx
          .insert(provinces)
          .overridingSystemValue()
          .values(
            temporaryProvinces.map(({ id, name }) => ({
              id,
              name,
            })),
          );

        for (const province of temporaryProvinces) {
          await tx
            .update(cities)
            .set({ provinceId: province.id })
            .where(eq(cities.provinceId, province.oldId));
          await tx
            .update(addresses)
            .set({ provinceId: province.id })
            .where(eq(addresses.provinceId, province.oldId));
        }

        await tx
          .delete(provinces)
          .where(inArray(provinces.id, [...managedIds]));

        for (const batch of chunk(provinceRows, BATCH_SIZE)) {
          await tx
            .insert(provinces)
            .overridingSystemValue()
            .values(batch)
            .onConflictDoUpdate({
              target: provinces.id,
              set: { name: sql`excluded.name` },
              setWhere: sql`${provinces.name} IS DISTINCT FROM excluded.name`,
            });
        }

        for (const province of temporaryProvinces) {
          await tx
            .update(cities)
            .set({ provinceId: province.targetId })
            .where(eq(cities.provinceId, province.id));
          await tx
            .update(addresses)
            .set({ provinceId: province.targetId })
            .where(eq(addresses.provinceId, province.id));
        }

        await tx.delete(provinces).where(
          inArray(
            provinces.id,
            temporaryProvinces.map(({ id }) => id),
          ),
        );
      } else {
        for (const batch of chunk(provinceRows, BATCH_SIZE)) {
          await tx
            .insert(provinces)
            .overridingSystemValue()
            .values(batch)
            .onConflictDoUpdate({
              target: provinces.id,
              set: { name: sql`excluded.name` },
              setWhere: sql`${provinces.name} IS DISTINCT FROM excluded.name`,
            });
        }
      }

      for (const batch of chunk(cityRows, BATCH_SIZE)) {
        await tx
          .insert(cities)
          .overridingSystemValue()
          .values(batch)
          .onConflictDoUpdate({
            target: cities.id,
            set: {
              name: sql`excluded.name`,
              provinceId: sql`excluded.province_id`,
            },
            setWhere: sql`(${cities.name}, ${cities.provinceId})
              IS DISTINCT FROM (excluded.name, excluded.province_id)`,
          });
      }

      await this.syncIdentitySequence(tx, provinces);
      await this.syncIdentitySequence(tx, cities);
    });

    const result = {
      provinces: provinceRows.length,
      cities: cityRows.length,
    };
    this.logger.log(
      `Seeded ${result.provinces} provinces and ${result.cities} cities`,
    );
    return result;
  }

  private toRows(source: LocationSource): {
    provinceRows: ProvinceRow[];
    cityRows: CityRow[];
  } {
    const provinceRows: ProvinceRow[] = [];
    const cityRows: CityRow[] = [];
    const provinceNames = new Set<string>();

    for (const province of source) {
      const name = normalizeLocationName(province.name);
      if (provinceNames.has(name)) {
        throw new Error(`Duplicate province name after normalize: "${name}"`);
      }
      provinceNames.add(name);
      provinceRows.push({ id: province.id, name });

      const cityNames = new Set<string>();
      for (const city of province.cities) {
        const cityName = normalizeLocationName(city.name);
        if (cityNames.has(cityName)) {
          throw new Error(
            `Duplicate city name "${cityName}" in province "${name}"`,
          );
        }
        cityNames.add(cityName);
        cityRows.push({ id: city.id, name: cityName, provinceId: province.id });
      }
    }

    provinceRows.sort((a, b) => a.id - b.id);
    cityRows.sort((a, b) => a.id - b.id);
    return { provinceRows, cityRows };
  }

  private async syncIdentitySequence(
    tx: Pick<NodePgDatabase, 'execute'>,
    table: PgTable & { id: AnyPgColumn },
  ): Promise<void> {
    const { schema, name } = getTableConfig(table);
    const qualified = `${schema ?? 'public'}.${name}`;

    const result = await tx.execute<{ value: string | null }>(sql`
      SELECT setval(
        pg_get_serial_sequence(${qualified}, 'id'),
        COALESCE(MAX(${table.id}), 1),
        MAX(${table.id}) IS NOT NULL
      ) AS value
      FROM ${table}
    `);

    if (result.rows[0]?.value == null) {
      throw new Error(`Could not sync identity sequence for ${qualified}`);
    }
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export function normalizeLocationName(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[۰-۹]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1728))
    .replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1584))
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
