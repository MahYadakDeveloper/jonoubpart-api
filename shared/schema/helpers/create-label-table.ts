import { getTableName, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  type PgSchema,
  type PgTable,
  bigint,
  boolean,
  check,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const LABEL_PREFIX_RE = /^[A-Z]{1,3}$/;

/** Throws if the prefix is not 1-3 uppercase letters. */
export const assertLabelPrefix = (prefix: string): void => {
  if (!LABEL_PREFIX_RE.test(prefix)) {
    throw new Error(`invalid label prefix: ${prefix}`);
  }
};

/** Regex source (string) of a label code, e.g. `^S[0-9]{12,19}$`. Same string is used in the DB CHECK. */
export const labelCodePatternSource = (prefix: string): string => {
  assertLabelPrefix(prefix);
  return `^${prefix}[0-9]{12,19}$`;
};

/** RegExp for app-side validation of a scanned code. */
export const labelCodeRegExp = (prefix: string): RegExp =>
  new RegExp(labelCodePatternSource(prefix));

/**
 * Creates the label tables of ONE owner table (e.g. `stocks`): `<owner>_label_counter`, `<owner>_label_free_seqs` and
 * `<owner>_labels`.
 *
 * A label is an optional, 1:1 tag of an owner row. The label row holds the reference (`owner_id`), so the owner table
 * needs no label column. Creating a label = `INSERT INTO <owner>_labels (owner_id)`; the number is allocated by a
 * trigger. Deleting the owner row deletes its label (ON DELETE CASCADE), which releases the number for reuse.
 *
 * Every owner has its own numbering, so one owner never waits for another one's counter lock. The allocation logic is
 * shared (`infra.next_label_seq()`, see migration 0001) and wired to these tables by per-owner triggers.
 *
 * Other tables must reference the OWNER (e.g. stocks.id), never the label: a restrict FK on the label would make the
 * owner undeletable.
 *
 * drizzle-kit only sees EXPORTED tables: export all three results. The owner table must be defined first and have a
 * uuid `id` primary key.
 *
 * @param schema Schema that owns the label tables.
 * @param owner The table whose rows get labels.
 * @param prefix 1-3 uppercase letters (A-Z) placed in front of every label code (e.g. `'S'` gives `S000000000042`). It
 *   must be UNIQUE per owner: it keeps codes unique across owners, so a scanned code can be routed to its owner without
 *   touching the database. The format is validated here; uniqueness across owners is the caller's responsibility.
 */
export const createLabelTables = (
  schema: PgSchema,
  owner: PgTable & { id: AnyPgColumn },
  prefix: string,
  maxPerOwner = 3,
) => {
  // The prefix is interpolated as a literal into SQL: allow only A-Z.
  if (!/^[A-Z]{1,3}$/.test(prefix)) {
    throw new Error(`invalid label prefix: ${prefix}`);
  }
  const base = getTableName(owner);
  const prefixLiteral = sql.raw(`'${prefix}'`);
  const idPattern = sql.raw(`'${labelCodePatternSource(prefix)}'`);

  // -------------------------------------------------------------------------
  // Single-row counter for FRESH label numbers.
  //
  // Why a table and not a SEQUENCE: nextval() is never rolled back, so every
  // rolled-back insert would burn a number forever (a permanent gap). An
  // UPDATE on this row happens inside the inserting transaction, so it rolls
  // back together with it.
  //
  // Managed ONLY by infra.next_label_seq() through the trigger
  // <owner>_labels_assign_seq (see migration 0001).
  // The row is seeded in migration 0001. max_seq is the ceiling for fresh
  // numbers; after last_seq reaches max_seq, numbers come from
  // <owner>_label_free_seqs.
  //
  // NOTE: the row lock is held until the end of the inserting transaction, so
  // all inserts into <owner>_labels are serialized. Keep transactions that
  // create new labels short.
  // -------------------------------------------------------------------------
  const counter = schema.table(
    `${base}_label_counter`,
    {
      singleton: boolean('singleton').default(true).primaryKey().notNull(),
      lastSeq: bigint('last_seq', { mode: 'bigint' })
        .default(sql`0`)
        .notNull(),
      maxSeq: bigint('max_seq', { mode: 'bigint' }).notNull(),
      // Max labels per owner row. Read by infra.assign_label_slot(); change it
      // with a plain UPDATE (lowering it never deletes existing labels).
      maxPerOwner: smallint('max_per_owner').default(maxPerOwner).notNull(),
    },
    (t) => [
      check(`${base}_label_counter_singleton_chk`, sql`${t.singleton}`),
      check(`${base}_label_counter_max_positive_chk`, sql`${t.maxSeq} > 0`),
      check(
        `${base}_label_counter_range_chk`,
        sql`${t.lastSeq} >= 0 AND ${t.lastSeq} <= ${t.maxSeq}`,
      ),
      check(
        `${base}_label_counter_max_per_owner_chk`,
        sql`${t.maxPerOwner} > 0`,
      ),
    ],
  );

  // -------------------------------------------------------------------------
  // Numbers released by deleted labels, waiting to be reused (only after the
  // counter has reached max_seq).
  // Managed ONLY by triggers/functions (see migration 0001).
  // -------------------------------------------------------------------------
  const freeSeqs = schema.table(
    `${base}_label_free_seqs`,
    {
      seq: bigint('seq', { mode: 'bigint' }).primaryKey().notNull(),
      freedAt: timestamp('freed_at', { withTimezone: true })
        .defaultNow()
        .notNull(),
    },
    (t) => [check(`${base}_label_free_seqs_positive_chk`, sql`${t.seq} > 0`)],
  );

  // -------------------------------------------------------------------------
  // Label = the physical tag ("S000000000042" for prefix S) of ONE owner row.
  // It carries identity and the reference to its owner; what is held under
  // the owner lives in the owner's own tables.
  //
  // Identity model: `seq` is the primary key and `id` (the label text,
  // generated from seq) is UNIQUE, so a scanned code resolves to exactly one
  // label and, through owner_id, to exactly one owner row. owner_id is UNIQUE:
  // an owner row has at most one label.
  //
  // The number is recycled only after the label row is deleted, which happens
  // when its owner row is deleted (cascade). So the owner's own FK protection
  // (children with restrict) is what decides when a number can be reused.
  //
  // References that live OUTSIDE foreign keys (events, logs, caches, printed
  // labels, POS, other databases) are NOT protected: purge/invalidate them
  // when a label is deleted.
  // -------------------------------------------------------------------------
  const labels = schema.table(
    `${base}_labels`,
    {
      // Allocated by the BEFORE INSERT trigger <owner>_labels_assign_seq.
      // DEFAULT NULL only makes the column optional for Drizzle inserts; the
      // trigger overwrites whatever is supplied. Immutable after insert
      // (trigger <owner>_labels_seq_immutable). Do not remove those triggers.
      seq: bigint('seq', { mode: 'bigint' })
        .default(sql`NULL`)
        .primaryKey()
        .notNull(),

      // Display label. Generated from seq, so it never changes during the
      // lifetime of a row.
      code: text('code')
        .notNull()
        .generatedAlwaysAs(
          sql`${prefixLiteral} || CASE
            WHEN length(seq::text) < 12
              THEN lpad(seq::text, 12, '0')
            ELSE seq::text
          END`,
        )
        .unique(`${base}_labels_code_uq`),

      // The tagged owner row. Cascade: deleting the owner deletes its label.
      [`${base}Id`]: uuid(`${base}_id`)
        .notNull()
        .references(() => owner.id, { onDelete: 'cascade' }),
    },
    (t) => [
      check(`${base}_labels_code_format_chk`, sql`${t.code} ~ ${idPattern}`),
      check(`${base}_labels_seq_positive_chk`, sql`${t.seq} > 0`),
      // One label per owner row. Also serves FK lookups by owner_id.
      // unique(`${base}_labels_owner_uq`).on(t[`${base}Id`]!),
    ],
  );

  return { counter, freeSeqs, labels };
};
