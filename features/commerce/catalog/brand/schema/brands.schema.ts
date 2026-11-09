import { sql } from 'drizzle-orm';
import { check, text, uuid } from 'drizzle-orm/pg-core';
import { createImageTable } from '../media/helpers/media-tables';
import { catalogSchema } from './catalog.schema';
import { slugChecks } from './helpers/slug-checks';

export const brands = catalogSchema.table(
  'brands',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    name: text('name').unique().notNull(),
    slug: text('slug').unique().notNull(),
  },
  (t) => [
    check(
      'brands_name_length_chk',
      sql`char_length(${t.name}) between 1 and 100`,
    ),
    ...slugChecks(t.slug),
  ],
);

export const brandLogos = createImageTable(catalogSchema, brands, {
  name: 'brand_logos',
  onOwnerDelete: 'cascade',
  relation: 'toOne',
  mimes: ['image/png', 'image/svg+xml', 'image/webp'],
});
