import { OmitPartials } from '@feature/shared';
import { DrizzleBaseRepository, DrizzleDbProvider } from '@infra/db-drizzle';
import {
  actorsRelations,
  couriers,
  deliveries,
} from '@infra/db-drizzle/schema';
import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { DBQueryConfigWith, eq } from 'drizzle-orm';

export type Courier = typeof couriers.$inferSelect & {
  deliveries: Omit<typeof deliveries.$inferSelect, 'courierId'>;
};

const withDeliveries = {
  deliveries: {
    columns: {
      courierId: false,
    },
  },
} satisfies DBQueryConfigWith<
  typeof actorsRelations,
  typeof actorsRelations.couriers.relations
>;

@Injectable()
export class CourierRepository extends DrizzleBaseRepository<
  typeof actorsRelations
> {
  constructor(
    dbProvider: DrizzleDbProvider<typeof actorsRelations>,
    forUpdateCtx: AsyncLocalStorage<'for_update'>,
  ) {
    super(dbProvider, forUpdateCtx);
  }

  findById(id: string): Promise<Courier | null> {
    return this.db.query.couriers
      .findFirst({
        where: {
          id: id,
        },
        with: withDeliveries,
      })
      .then((courier) => courier ?? null);
  }

  findByPhone(phone: string): Promise<Courier | null> {
    return this.db.query.couriers
      .findFirst({
        where: {
          phone: phone,
        },
        with: withDeliveries,
      })
      .then((courier) => courier ?? null);
  }

  findAll(): Promise<Courier[]> {
    return this.db.query.couriers.findMany({
      with: withDeliveries,
    });
  }

  async create(
    courier: OmitPartials<typeof couriers.$inferInsert>,
  ): Promise<void> {
    await this.db.insert(couriers).values(courier);
  }

  async update(id: string, courier: Partial<Courier>): Promise<void> {
    await this.db.update(couriers).set(courier).where(eq(couriers.id, id));
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(couriers).where(eq(couriers.id, id));
  }
}
