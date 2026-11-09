import { commerceSchema } from '@commerce/schema';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { catalogItems } from './catalog-items.schema';
import { products } from './products.schema';

export const bundles = commerceSchema.table(
  'bundles',
  {
    id: uuid('id')
      .notNull()
      .references(() => catalogItems.id, { onDelete: 'cascade' }),

    displayName: text('display_name').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      'bundles_display_name_not_blank',
      sql`char_length(btrim(${t.displayName})) > 0`,
    ),
  ],
);

export const bundleItems = commerceSchema.table(
  'bundle_items',
  {
    bundleId: uuid('bundle_id')
      .notNull()
      .references(() => bundles.id, { onDelete: 'cascade' }),

    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),

    quantity: integer('quantity').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.bundleId, t.productId] }),
    index('bundle_items_product_id_idx').on(t.productId),
    check('bundle_items_quantity_positive', sql`${t.quantity} > 0`),
  ],
);
