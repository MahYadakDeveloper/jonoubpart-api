import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  type PgSchema,
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { stocks } from '../warehouse/stocks.schema';

export type MerchandiseLineDiscount = {
  discountPerUnit: number;
  discountedQuantity: number;
  totalDiscount: number;
};

const money = (name: string) => bigint(name, { mode: 'number' });

export const merchandiseLineKind = pgEnum('merchandise_line_kind', [
  'product',
  'bundle',
]);

// A computed key built from a generic string widens to `string` and the
// column would lose its name in the table type. This keeps the literal key.
const keyed = <K extends string, V>(key: K, value: V) =>
  ({ [key]: value }) as { [P in K]: V };

// ---------------------------------------------------------------------------
// Lines: one row per sold catalog item (a product or a bundle).
// Bundle contents live in `<name>_merchandise_line_items`.
// No FK to products/catalog on purpose: orders and sales live in other
// databases and keep their own snapshot of what was sold.
// ---------------------------------------------------------------------------
export const createMerchandiseLines = <N extends string>(
  schema: PgSchema,
  name: N,
  parent: () => AnyPgColumn,
) => {
  const ownerKey = `${name}Id` as const;

  return schema.table(
    `${name}_merchandise_lines`,
    {
      id: uuid('id').primaryKey().defaultRandom(),

      ...keyed(
        ownerKey,
        uuid(`${name}_id`)
          .references(parent, { onDelete: 'cascade' })
          .notNull(),
      ),

      kind: merchandiseLineKind('kind').notNull(),

      // The catalog item that was sold (a product or a bundle).
      productId: uuid('product_id').notNull(),
      quantity: integer('quantity').notNull(),
      unitPrice: money('unit_price').notNull(),
      lineTotal: money('line_total').notNull(),

      // The product behind a 'product' line. NULL for bundle lines.
      stockId: uuid('stock_id').references(() => stocks.id, {
        onDelete: 'restrict',
      }),

      discount: jsonb('discount').$type<MerchandiseLineDiscount>(),
    },
    (t) => [
      // Target of the composite FK from line items (guarantees that items
      // can only belong to a 'bundle' line). id is the PK, so this adds no
      // new restriction.
      unique(`${name}_line_id_kind_uq`).on(t.id, t.kind),

      index(`${name}_line_owner_idx`).on(t[ownerKey]),

      check(
        `${name}_line_product_id_by_kind_chk`,
        sql`(${t.kind} = 'product') = (${t.stockId} IS NOT NULL)`,
      ),
      check(
        `${name}_line_discount_is_object_chk`,
        sql`${t.discount} IS NULL OR jsonb_typeof(${t.discount}) = 'object'`,
      ),
      check(`${name}_line_positive_quantity_chk`, sql`${t.quantity} > 0`),
      check(
        `${name}_line_non_negative_money_chk`,
        sql`${t.unitPrice} >= 0 AND ${t.lineTotal} >= 0`,
      ),
    ],
  );
};

// ---------------------------------------------------------------------------
// Line items: the products inside a 'bundle' line.
// ---------------------------------------------------------------------------
type MerchandiseLinesTable = { id: AnyPgColumn; kind: AnyPgColumn };

export const createMerchandiseLineItems = <N extends string>(
  schema: PgSchema,
  name: N,
  lines: MerchandiseLinesTable,
) => {
  const lineKey = `${name}MerchandiseLineId` as const;

  return schema.table(
    `${name}_merchandise_line_items`,
    {
      id: uuid('id').defaultRandom().primaryKey(),

      // The FK is the composite one below, so no .references() here.
      ...keyed(lineKey, uuid(`${name}_merchandise_line_id`).notNull()),

      // Always 'bundle'; exists only so the composite FK can enforce it.
      lineKind: merchandiseLineKind('line_kind').notNull().default('bundle'),

      catalogItemId: uuid('catalog_item_id').notNull(),
      stockId: uuid('stock_id')
        .references(() => stocks.id, {
          onDelete: 'restrict',
        })
        .notNull(),
      quantity: integer('quantity').notNull(),
      unitPrice: money('unit_price').notNull(),
      lineTotal: money('line_total').notNull(),
    },
    (t) => [
      foreignKey({
        name: `${name}_line_item_line_fk`,
        columns: [t[lineKey], t.lineKind],
        foreignColumns: [lines.id, lines.kind],
      }).onDelete('cascade'),

      index(`${name}_line_item_line_idx`).on(t[lineKey]),

      check(`${name}_line_item_is_bundle_chk`, sql`${t.lineKind} = 'bundle'`),
      check(`${name}_line_item_positive_quantity_chk`, sql`${t.quantity} > 0`),
      check(
        `${name}_line_item_non_negative_money_chk`,
        sql`${t.unitPrice} >= 0 AND ${t.lineTotal} >= 0`,
      ),
    ],
  );
};
