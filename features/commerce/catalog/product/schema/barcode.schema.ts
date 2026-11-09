import { commerceSchema } from '@commerce/schema';
import { sql } from 'drizzle-orm';
import { check, index, primaryKey, text, uuid } from 'drizzle-orm/pg-core';

import { products } from './products.schema';

// Single source of truth. Patterns are plain strings so JS and Postgres
// receive identical text. Keep them in the common JS/POSIX subset
// (character classes, {n,m}, anchors; no \d, lookahead or flags).
export const BARCODE_PATTERNS = {
  UPC_A: '^[0-9]{12}$',
  UPC_E: '^[01][0-9]{7}$', // number system must be 0 or 1
  EAN_13: '^[0-9]{13}$',
  EAN_8: '^[0-9]{8}$',
  GTIN_14: '^[0-9]{14}$', // ITF-14, usually on cartons
  CODE_39: '^[0-9A-Z. $/+%-]{1,64}$',
  CODE_93: '^[0-9A-Z. $/+%-]{1,64}$',
  CODE_128: '^[ -~]{1,64}$',
  CODABAR: '^[A-D][0-9$:/.+-]{1,62}[A-D]$',
} as const;

export type BarcodeType = keyof typeof BARCODE_PATTERNS;
export const BARCODE_TYPES = Object.keys(BARCODE_PATTERNS) as [
  BarcodeType,
  ...BarcodeType[],
];

export const BARCODE_CONSTRAINTS = {
  barcodePk: 'barcodes_type_value_pk',
  barcodeValueFormat: 'barcodes_value_format_chk',
} as const;

// DDL constants only, never user input.
const lit = (s: string) => sql.raw(`'${s.replaceAll("'", "''")}'`);

export const barcodeType = commerceSchema.enum('barcode_type', BARCODE_TYPES);

export const barcodes = commerceSchema.table(
  'barcodes',
  {
    productId: uuid('product_id')
      .references(() => products.id, { onDelete: 'cascade' })
      .notNull(),
    type: barcodeType('type').notNull(),
    value: text('raw_value').notNull(), // the only written column
  },
  (t) => [
    primaryKey({
      name: BARCODE_CONSTRAINTS.barcodePk,
      columns: [t.type, t.value],
    }),
    index('barcodes_product_id_idx').on(t.productId),
    check(
      BARCODE_CONSTRAINTS.barcodeValueFormat,
      sql`
        CASE ${t.type} ${sql.join(
          Object.entries(BARCODE_PATTERNS).map(
            ([type, pattern]) => sql`
              WHEN ${lit(type)} THEN ${t.value} ~ ${lit(pattern)}
            `,
          ),
          sql``,
        )}
          ELSE FALSE
        END
      `,
    ),
  ],
);
