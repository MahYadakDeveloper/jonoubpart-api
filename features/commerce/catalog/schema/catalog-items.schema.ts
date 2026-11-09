import { commerceSchema } from '@commerce/schema';
import { boolean, uuid } from 'drizzle-orm/pg-core';

export const catalogItems = commerceSchema.table('catalog_items', {
  id: uuid('id').defaultRandom().primaryKey(),

  storefront: boolean('storefront').notNull().default(false),
});
