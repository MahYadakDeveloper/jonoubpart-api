import { logisticsSchema } from '@logistics/schema';
import { index, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// External warehouses only. The storeroom is not a row here: it is the set of
// shelves whose warehouse_id is NULL.
export const warehouses = logisticsSchema.table(
  'warehouses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    address: text('address'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index('created_at_idx').on(t.createdAt)],
);
