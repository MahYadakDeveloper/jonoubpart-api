import { TablesRelationalConfig } from 'drizzle-orm';
import {
  BunSQLDatabase,
  BunSQLTransaction,
} from 'drizzle-orm/bun-sql/postgres';
import { LockConfig, LockStrength } from 'drizzle-orm/pg-core';

export type Database<T extends TablesRelationalConfig = {}> = BunSQLDatabase<T>;

export type DbTransaction<T extends TablesRelationalConfig = {}> =
  BunSQLTransaction<T>;

/** A query that can have a row lock (`FOR UPDATE`, ...) appended. */
export type LockableQuery<R> = PromiseLike<R> & {
  for: (strength: LockStrength, config?: LockConfig) => PromiseLike<R>;
};

export interface DrizzleRepository<
  TRelations extends TablesRelationalConfig = {},
> {
  /** Current transaction if any, otherwise the plain database. */
  readonly db: Database<TRelations> | DbTransaction<TRelations>;

  /** Joins the current transaction or starts a new one. */
  transaction<R>(fn: () => Promise<R>): Promise<R>;

  /**
   * Appends `FOR <strength>` when a lock is active in the current scope. `of`:
   * tables to lock; required for joins you don't want locked (and the nullable
   * side of a leftJoin). Not allowed with groupBy/DISTINCT/HAVING/aggregates.
   * The query must be complete before the call.
   */
  applyLockConditionally<R>(
    query: LockableQuery<R>,
    of?: LockConfig['of'],
  ): PromiseLike<R>;
}
