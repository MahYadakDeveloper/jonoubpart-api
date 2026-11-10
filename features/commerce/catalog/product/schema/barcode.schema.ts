import { commerceSchema } from '@commerce/schema';
import { sql } from 'drizzle-orm';
import { check, text, uuid } from 'drizzle-orm/pg-core';

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

export const BARCODE_CONSTRAINTS = {
  barcodeFormat: 'barcodes_format_chk',
} as const;

// DDL constants only, never user input.
const lit = (s: string) => sql.raw(`'${s.replaceAll("'", "''")}'`);

export const codes = commerceSchema.table(
  'product_codes',
  {
    code: text('code').primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
  },
  (t) => [
    check(
      BARCODE_CONSTRAINTS.barcodeFormat,
      sql`
        (${sql.join(
          Object.values(BARCODE_PATTERNS).map(
            (pattern) => sql`${t.code} ~ ${lit(pattern)}`,
          ),
          sql` OR `,
        )})
      `,
    ),
  ],
);
