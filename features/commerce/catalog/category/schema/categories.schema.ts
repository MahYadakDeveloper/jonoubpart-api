import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { catalogSchema } from './catalog.schema';
import { slugChecks } from './helpers/slug-checks';

export const categories = catalogSchema.table(
  'categories',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id, {
      onDelete: 'restrict',
    }),

    name: text('name').notNull(),
    slug: text('slug').notNull(),

    sortOrder: integer('sort_order').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    ...slugChecks(t.slug),

    check(
      'categories_not_self_parent_chk',
      sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`,
    ),

    unique('categories_parent_slug_unique')
      .on(t.parentId, t.slug)
      .nullsNotDistinct(),

    index('categories_parent_sort_idx').on(t.parentId, t.sortOrder),
  ],
);
