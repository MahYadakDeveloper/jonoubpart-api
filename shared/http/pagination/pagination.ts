import {
  and,
  AnyColumn,
  asc,
  Column,
  DBQueryConfigOrderByObject,
  desc,
  getColumns,
  gte,
  inArray,
  lte,
  SQL,
  Table,
} from 'drizzle-orm';
import { z } from 'zod';

/**
 * page-query.schema.ts
 *
 * Builds a zod schema for list endpoints:
 *
 * - offset pagination (page / size)
 * - whitelisted multi-field sorting (?sort=-createdAt,total)
 * - multi-value filters (?status=paid,pending or ?status=paid&status=pending)
 * - range filters (?total[gte]=100&total[lte]=500)
 *
 * Requires Fastify to be configured with `qs` (see FASTIFY SETUP at the bottom), otherwise `total[gte]` is NOT parsed
 * into a nested object.
 *
 * Install: bun add zod qs && bun add -d @types/qs
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface PageResult<T, TPagination extends Pagination> {
  page: Page<T, TPagination>;
}

export interface PageFilters {}

export interface PageSort {
  field: PageSortField;

  direction: SortDirection;
}

export type SortDirection = 'asc' | 'desc';

export type PageSortField = 'createdAt';

export type Page<
  T,
  TPagination extends Pagination,
> = TPagination extends OffsetPagination
  ? OffsetPage<T>
  : TPagination extends CursorPagination
    ? CursorPage<T>
    : never;

export interface OffsetPage<T> {
  items: readonly T[];

  number: number;
  size: number;
  totalItems: number;
  totalPages: number;

  hasNext: boolean;
  hasPrevious: boolean;
}

export interface CursorPage<T> {
  items: readonly T[];

  size: number;
  hasNext: boolean;
  hasPrevious: boolean;

  nextCursor?: string;
}

export type Pagination = OffsetPagination | CursorPagination;

export interface OffsetPagination {
  type: 'offset';

  page: number;

  size: number;
}

export interface CursorPagination {
  type: 'cursor';

  after?: string;

  size: number;
}

const NON_SORTABLE = ['json', 'array', 'buffer'] as const;
type NonSortable = (typeof NON_SORTABLE)[number];
export const NON_SORTABLE_SET: ReadonlySet<string> = new Set(NON_SORTABLE);

export type SortableKeys<T extends Table> = {
  [
    K in keyof T['_']['columns']
  ]: T['_']['columns'][K]['_']['dataType'] extends NonSortable ? never : K;
}[keyof T['_']['columns']];

export type PageCriteria<TTable extends Table> = {
  sort: {
    field: SortableKeys<TTable>;
    direction: 'asc' | 'desc';
  }[];
  page: number;
  size: number;
};

/** "createdAt" (asc) or "-createdAt" (desc). */
export type SortExpr<K extends string> = K | `-${K}`;

export type SortTerm<K extends string> = {
  field: K;
  direction: 'asc' | 'desc';
};

/** Map of query-key -> zod schema describing a SINGLE value / SINGLE bound. */
type Shape = Record<string, z.ZodType>;

/** filters: every key becomes an optional array of values. */
type FilterOut<F extends Shape> = {
  [P in keyof F]?: z.output<F[P]>[];
};

/** ranges: every key becomes an optional { min?, max? } object. */
type RangeOut<R extends Shape> = {
  [P in keyof R]?: { min?: z.output<R[P]>; max?: z.output<R[P]> };
};

/** Keys that are owned by the schema itself and cannot be used as filter/range names. */
const RESERVED_KEYS = new Set(['page', 'size', 'sort']);

/* -------------------------------------------------------------------------- */
/* Sort                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Parses a single sort term ("-createdAt" / "total") and validates the field against the whitelist. Clients can never
 * sort by a column that is not listed.
 */
function sortTerm<K extends string>(fields: readonly [K, ...K[]]) {
  const allowed: ReadonlySet<string> = new Set(fields);
  // Type guard so that `field` is narrowed to K after the check.
  const isField = (v: string): v is K => allowed.has(v);

  return z.string().transform((raw, ctx): SortTerm<K> => {
    const term = raw.trim();
    const direction = term.startsWith('-') ? 'desc' : 'asc';
    const field = direction === 'desc' ? term.slice(1) : term;

    if (!isField(field)) {
      ctx.addIssue({
        code: 'custom',
        message: `Cannot sort by "${field}". Allowed: ${fields.join(', ')}`,
      });
      return z.NEVER;
    }
    return { field, direction };
  });
}

/**
 * "?sort=-createdAt,total" -> [{ field: 'createdAt', direction: 'desc' }, ...] Falls back to `defaultSort` when the
 * param is missing or blank. Max 3 terms, no duplicate fields.
 */
function sortSchema<K extends string>(
  fields: readonly [K, ...K[]],
  defaultSort: readonly [SortExpr<K>, ...SortExpr<K>[]],
) {
  return z
    .string()
    .optional()
    .transform((v) => (v?.trim() ? v : defaultSort.join(',')))
    .transform((v) => v.split(',').filter(Boolean))
    .pipe(
      z
        .array(sortTerm(fields))
        .min(1)
        .max(3)
        .refine(
          (terms) => new Set(terms.map((t) => t.field)).size === terms.length,
          'Duplicate sort fields',
        ),
    );
}

/* -------------------------------------------------------------------------- */
/* Multi-value filters                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Normalizes every shape the query parser may hand us into string[] | undefined: "a" -> ["a"] "a,b" -> ["a", "b"] (when
 * qs `comma: true` is off) ["a", "b,c"] -> ["a", "b", "c"] (?x=a&x=b,c) "" / undefined -> undefined (treated as "filter
 * not provided")
 *
 * Non-string items (e.g. objects from `?status[a]=1`) are passed through untouched so the item schema rejects them with
 * a proper 400.
 */
const toList = (v: unknown): unknown[] | undefined => {
  if (v === undefined || v === null) return undefined;

  const list = (Array.isArray(v) ? v : [v])
    .flatMap((x) => (typeof x === 'string' ? x.split(',') : [x]))
    .map((x) => (typeof x === 'string' ? x.trim() : x))
    .filter((x) => x !== '');

  return list.length ? list : undefined;
};

/** Optional array (1..50 items) of `item`. The cap protects the SQL `IN (...)` size. */
const listOf = <T extends z.ZodType>(item: T) =>
  z.preprocess(toList, z.array(item).min(1).max(50).optional());

/* -------------------------------------------------------------------------- */
/* Range filters                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A single optional bound. An empty string ("?total[gte]=") is treated as "not provided" BEFORE coercion — important
 * because `z.coerce.date()` would otherwise turn '' into the epoch and `z.coerce.number()` into 0.
 */
const bound = <T extends z.ZodType>(item: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), item.optional());

/**
 * `?field[gte]=..&field[lte]=..` -> { gte?, lte? } `.strict()` makes unknown operators (`field[foo]`, `field[gt]`) a
 * 400 instead of being silently ignored.
 */
const rangeOf = <T extends z.ZodType>(item: T) =>
  z
    .object({
      gte: bound(item),
      lte: bound(item),
    })
    .strict()
    .optional();

/* -------------------------------------------------------------------------- */
/* Main factory                                                               */
/* -------------------------------------------------------------------------- */

export function createPageQuerySchema<
  K extends string,
  F extends Shape = {},
  R extends Shape = {},
>(options: {
  /** Whitelist of sortable fields (API field names, not necessarily column names). */
  sortFields: readonly [K, ...K[]];
  /** Used when `sort` is missing, e.g. ['-createdAt']. */
  defaultSort: NoInfer<readonly [SortExpr<K>, ...SortExpr<K>[]]>;
  /**
   * Multi-value filters. Each value is a schema for ONE value, e.g. status: z.enum(['pending', 'paid']) categoryId:
   * z.coerce.number().int().positive()
   */
  filters?: F;
  /**
   * Range filters. Each value is a schema for ONE bound, e.g. total: z.coerce.number().nonnegative() createdAt:
   * z.coerce.date()
   */
  ranges?: R;
}) {
  const filters = (options.filters ?? {}) as F;
  const ranges = (options.ranges ?? {}) as R;

  // Fail fast at startup (not at request time) on naming mistakes.
  const filterKeys = Object.keys(filters);
  const rangeKeys = Object.keys(ranges);
  for (const key of [...filterKeys, ...rangeKeys]) {
    if (RESERVED_KEYS.has(key)) {
      throw new Error(`"${key}" is reserved and cannot be a filter/range key`);
    }
  }
  const overlap = filterKeys.filter((k) => rangeKeys.includes(k));
  if (overlap.length) {
    throw new Error(
      `Keys used as both filter and range: ${overlap.join(', ')}`,
    );
  }

  const filterShape = Object.fromEntries(
    Object.entries(filters).map(([key, item]) => [key, listOf(item)]),
  );
  const rangeShape = Object.fromEntries(
    Object.entries(ranges).map(([key, item]) => [key, rangeOf(item)]),
  );

  return z
    .object({
      page: z.coerce.number().int().min(1).max(10_000).default(1),
      size: z.coerce.number().int().min(1).max(100).default(20),
      sort: sortSchema(options.sortFields, options.defaultSort),
      ...filterShape,
      ...rangeShape,
    })
    .transform((raw, ctx) => {
      // The dynamic keys are untyped here; the final return type is restored below.
      const { page, size, sort, ...rest } = raw as Record<string, any>;

      // Keep only filters that were actually provided.
      const filterOut: Record<string, unknown[]> = {};
      for (const key of filterKeys) {
        if (rest[key] !== undefined) filterOut[key] = rest[key];
      }

      // Normalize ranges to { min, max } and validate min <= max.
      const rangeOut: Record<string, { min?: unknown; max?: unknown }> = {};
      for (const key of rangeKeys) {
        const r = rest[key] as { gte?: any; lte?: any } | undefined;
        if (!r || (r.gte === undefined && r.lte === undefined)) continue;

        // `>` works for numbers and Dates (Date is compared by valueOf()).
        if (r.gte !== undefined && r.lte !== undefined && r.gte > r.lte) {
          ctx.addIssue({
            code: 'custom',
            path: [key, 'gte'],
            message: `${key}[gte] must be <= ${key}[lte]`,
          });
          return z.NEVER;
        }
        rangeOut[key] = { min: r.gte, max: r.lte };
      }

      return {
        page: page as number,
        size: size as number,
        sort: sort as SortTerm<K>[],
        filters: filterOut as FilterOut<F>,
        ranges: rangeOut as RangeOut<R>,
      };
    });
}

/* -------------------------------------------------------------------------- */
/* Drizzle helper                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Converts parsed filters/ranges into a Drizzle `where` condition.
 *
 * `columns` is an EXPLICIT map of query-key -> column on purpose: it is the second whitelist layer, so a client can
 * only filter on columns you expose.
 *
 * Returns `undefined` when nothing was provided (safe to pass to `.where()`).
 */
export function buildFilterWhere(
  columns: Record<string, AnyColumn>,
  filters: Record<string, unknown[] | undefined>,
  ranges: Record<string, { min?: unknown; max?: unknown } | undefined>,
): SQL | undefined {
  const conds: SQL[] = [];

  for (const [key, values] of Object.entries(filters)) {
    if (!values?.length) continue;
    const column = columns[key];
    if (!column) throw new Error(`No column mapped for filter "${key}"`);
    conds.push(inArray(column, values));
  }

  for (const [key, r] of Object.entries(ranges)) {
    if (!r) continue;
    const column = columns[key];
    if (!column) throw new Error(`No column mapped for range "${key}"`);
    if (r.min !== undefined) conds.push(gte(column, r.min));
    if (r.max !== undefined) conds.push(lte(column, r.max));
  }

  return conds.length ? and(...conds) : undefined;
}

/* -------------------------------------------------------------------------- */
/* USAGE                                                                      */
/* -------------------------------------------------------------------------- */
/*
const ordersQuery = createPageQuerySchema({
  sortFields: ['createdAt', 'total', 'id'],
  defaultSort: ['-createdAt'],
  filters: {
    status: z.enum(['pending', 'processing', 'paid', 'failure', 'expired', 'refunded']),
    categoryId: z.coerce.number().int().positive(),
  },
  ranges: {
    total: z.coerce.number().nonnegative(),
    createdAt: z.coerce.date(),
  },
});

export type OrdersQuery = z.output<typeof ordersQuery>;

// GET /orders?status=paid,pending&categoryId=1&total[gte]=100&total[lte]=500&sort=-createdAt&page=2
const q = ordersQuery.parse(request.query);

const where = buildFilterWhere(
  {
    status: orders.status,
    categoryId: orders.categoryId,
    total: orders.total,
    createdAt: orders.createdAt,
  },
  q.filters,
  q.ranges,
);

const rows = await db
  .select()
  .from(orders)
  .where(where)
  .orderBy(...q.sort.map((s) => (s.direction === 'asc' ? asc(orders[s.field]) : desc(orders[s.field]))))
  .limit(q.size)
  .offset((q.page - 1) * q.size);
*/

/* -------------------------------------------------------------------------- */
/* FASTIFY SETUP (qs)                                                         */
/* -------------------------------------------------------------------------- */
/*
import Fastify from 'fastify';
import qs from 'qs';

const app = Fastify({
  querystringParser: (str) =>
    qs.parse(str, {
      comma: true,          // status=a,b -> ['a', 'b']
      depth: 2,             // allows total[gte], rejects deeply nested objects
      arrayLimit: 50,       // max array length
      parameterLimit: 100,  // max number of params
      allowPrototypes: false,
      plainObjects: false,
    }),
});
*/

// ------------------

export type SortSpec<K extends PropertyKey = string> = readonly {
  field: K;
  direction: SortDirection;
}[];

type Comparable = string | number | bigint | boolean | Date | null | undefined;

const compareValues = (a: Comparable, b: Comparable): number => {
  if (a == null || b == null) {
    return a == null ? (b == null ? 0 : 1) : -1;
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }
  return a < b ? -1 : a > b ? 1 : 0;
};

export function sortBy<T, K extends keyof T>(
  items: readonly T[],
  sort: SortSpec<K>,
): T[] {
  return items.toSorted((x, y) => {
    for (const { field, direction } of sort) {
      const result = compareValues(
        x[field] as Comparable,
        y[field] as Comparable,
      );
      if (result !== 0) return direction === 'asc' ? result : -result;
    }
    return 0;
  });
}

export const sortableFields = <T extends Table>(table: T) => {
  const fields = Object.entries(getColumns(table) as Record<string, Column>)
    .filter(([, col]) => !NON_SORTABLE_SET.has(col.dataType))
    .map(([name]) => name);

  if (fields.length === 0) {
    throw new Error('Table has no sortable columns');
  }

  return fields as unknown as readonly [SortableKeys<T>, ...SortableKeys<T>[]];
};

export const orderByQuery = <TTable extends Table>(
  sort: { field: SortableKeys<TTable>; direction: 'asc' | 'desc' }[],
): DBQueryConfigOrderByObject<TTable['_']['columns']> => {
  const result: DBQueryConfigOrderByObject<TTable['_']['columns']> = {};

  for (const { field, direction } of sort) {
    if (!(field in result)) result[field] = direction;
  }

  return result;
};

export const orderBy = <TTable extends Table>(
  table: TTable,
  sort: { field: SortableKeys<TTable>; direction: 'asc' | 'desc' }[],
): SQL[] => {
  const columns = getColumns(table) as Record<string, Column>;

  return sort.map(({ field, direction }) => {
    const column = columns[field as string];

    if (!column) {
      throw new Error(`Unknown sort field: ${String(field)}`);
    }

    return direction === 'asc' ? asc(column) : desc(column);
  });
};
