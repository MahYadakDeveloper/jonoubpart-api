import { DrizzleBaseRepository } from '@infra/db-drizzle';
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

export interface FkRef {
  /** Schema-qualified, quoted by Postgres. */
  table: string;
  /** Column of the referencing table that points to the target column. */
  column: string;
}

export interface PurgeBatchOptions {
  batchSize: number;
  graceDays: number;
  statementTimeoutMs: number;
}

@Injectable()
export class WarehousePurgeRepository extends DrizzleBaseRepository {
  /**
   * Every FK that points to `target`, read from the catalog. For composite FKs, returns the referencing column that
   * maps to `refColumn` (any row referencing the target must match on it, so it is enough for NOT EXISTS). Throws if
   * some FK does not include `refColumn`: it would be invisible to the purge.
   */
  async findReferences(target: string, refColumn: string): Promise<FkRef[]> {
    const res = await this.db.execute<{
      table: string;
      column: string | null;
      conname: string;
    }>(sql`
      SELECT format('%I.%I', n.nspname, cl.relname) AS "table",
             c.conname                              AS conname,
             (
               SELECT quote_ident(a.attname)
                 FROM unnest(c.conkey, c.confkey) AS k(attnum, refnum)
                 JOIN pg_attribute a  ON a.attrelid  = c.conrelid  AND a.attnum  = k.attnum
                 JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = k.refnum
                WHERE ra.attname = ${refColumn}
             )                                      AS "column"
        FROM pg_constraint c
        JOIN pg_class cl    ON cl.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace
       WHERE c.contype = 'f'
         AND c.confrelid = ${target}::regclass
    `);

    const seen = new Set<string>();
    const refs: FkRef[] = [];
    for (const r of res) {
      if (r.column === null) {
        throw new Error(
          `FK ${r.conname} on ${r.table} references ${target} without column "${refColumn}"; not supported by the purge`,
        );
      }
      const key = `${r.table}.${r.column}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({ table: r.table, column: r.column });
    }
    return refs;
  }

  /**
   * Deletes one batch of stocks that are empty past the grace period and unreferenced. Locked rows are skipped, never
   * waited on. Returns the deleted stock ids.
   */
  async deleteEmptyStocksBatch(
    refs: FkRef[],
    opts: PurgeBatchOptions,
  ): Promise<string[]> {
    // Identifiers come from the catalog (quoted), never from user input.
    const notExists = refs.map(
      (r) => sql`AND NOT EXISTS (
        SELECT 1 FROM ${sql.raw(r.table)} x
         WHERE x.${sql.raw(r.column)} = s.id
      )`,
    );

    return this.transaction(async () => {
      await this.setStatementTimeout(opts.statementTimeoutMs);

      const res = await this.db.execute<{ id: string }>(sql`
        WITH picked AS (
          SELECT s.id
            FROM warehouse.stocks s
           WHERE s.quantity = 0
             AND s.zeroed_at <= now() - make_interval(days => ${opts.graceDays}::int)
             ${sql.join(notExists, sql` `)}
           ORDER BY s.zeroed_at, s.id
           LIMIT ${opts.batchSize}
             FOR UPDATE OF s SKIP LOCKED
        )
        DELETE FROM warehouse.stocks s
         USING picked p
         WHERE s.id = p.id
           AND s.quantity = 0
        RETURNING s.id
      `);
      return res.map((r) => r.id);
    });
  }

  /**
   * Deletes one batch of labels that are older than the grace period and referenced by nothing (no stock, no movement,
   * ...). The AFTER DELETE trigger releases their numbers into free_label_seqs. Returns the deleted label ids (e.g.
   * 'S000000000042').
   */
  async deleteOrphanLabelsBatch(
    refs: FkRef[],
    opts: PurgeBatchOptions,
  ): Promise<string[]> {
    const notExists = refs.map(
      (r) => sql`AND NOT EXISTS (
        SELECT 1 FROM ${sql.raw(r.table)} x
         WHERE x.${sql.raw(r.column)} = l.id
      )`,
    );

    return this.transaction(async () => {
      await this.setStatementTimeout(opts.statementTimeoutMs);

      const res = await this.db.execute<{ id: string }>(sql`
        WITH picked AS (
          SELECT l.seq
            FROM warehouse.labels l
           WHERE l.created_at <= now() - make_interval(days => ${opts.graceDays}::int)
             ${sql.join(notExists, sql` `)}
           ORDER BY l.created_at, l.seq
           LIMIT ${opts.batchSize}
             FOR UPDATE OF l SKIP LOCKED
        )
        DELETE FROM warehouse.labels l
         USING picked p
         WHERE l.seq = p.seq
        RETURNING l.id
      `);
      return res.map((r) => r.id);
    });
  }

  private async setStatementTimeout(ms: number): Promise<void> {
    await this.db.execute(
      sql`SELECT set_config('statement_timeout', ${String(ms)}, true)`,
    );
  }
}
