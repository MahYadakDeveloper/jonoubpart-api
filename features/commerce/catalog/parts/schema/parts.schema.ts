import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { catalogSchema } from './catalog.schema';
import { categories } from './categories.schema';
import { slugChecks } from './helpers/slug-checks';
import { vehicleNodes } from './vehicles.schema';

export const partQuality = catalogSchema.enum('part_quality', [
  'oe',
  'oem',
  'aftermarket',
]);

export const aliases = catalogSchema.table(
  'part_aliases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    modelId: uuid('model_id')
      .notNull()
      .references(() => models.id, { onDelete: 'cascade' }),
    alias: text('alias').notNull(),
  },
  (t) => [unique('model_aliases_uq').on(t.modelId, t.alias)],
);

export const models = catalogSchema.table(
  'part_models',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    /** Ex: "Lent", "Oxygen sensor", "..." */
    name: text('name').notNull(),
    /** Ex: (related to name) "lent", "oxygen-sensor" */
    slug: text('slug').notNull(),

    specs: jsonb('specs').$type<Record<string, string | number>>(),
  },
  (t) => [...slugChecks(t.slug)],
);

export const parts = catalogSchema.table(
  'parts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    modelId: uuid('model_id')
      .notNull()
      .references(() => models.id, { onDelete: 'cascade' }),
    // Ex: «left»، «right»، «siemens», is loose for any format and value
    variant: text('variant').notNull(),
    partNumber: varchar('part_number', { length: 100 }),

    quality: partQuality('quality').notNull(),
  },
  (t) => [
    unique('parts_model_variant_uq').on(t.modelId, t.variant),
    index('parts_model_idx').on(t.modelId),
  ],
);

export const partFitments = catalogSchema.table(
  'part_fitments',
  {
    partId: uuid('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'cascade' }),

    nodeId: uuid('node_id')
      .notNull()
      .references(() => vehicleNodes.id, { onDelete: 'restrict' }),

    /**
     * Optional free-text remark that qualifies this fitment. Use it for part-specific details that
     * the vehicle tree cannot express, for example:
     *
     * - position or side: "Left side only", "Right (passenger side)", "Front axle", "Siemens long
     *   wire for bottom - 2nd one"
     * - variant or option: "With sunroof", "Models with ABS only"
     * - production range: "Built after 03/2018"
     * - installation hint: "Requires bracket X", "Check connector type" Display it next to the part
     *   on the vehicle's compatible-products list. It is informational only and must not be used
     *   for filtering or matching logic.
     */
    note: text('note'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({
      name: 'part_fitments_pk',
      columns: [t.partId, t.nodeId],
    }),

    index('part_fitments_node_idx').on(t.nodeId),
  ],
);

export const partCategories = catalogSchema.table(
  'part_categories',
  {
    partId: uuid('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'cascade' }),

    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),

    primary: boolean('is_primary').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.partId, t.categoryId] }),

    index('part_categories_category_idx').on(t.categoryId),

    uniqueIndex('part_categories_one_primary_idx')
      .on(t.partId)
      .where(sql`${t.primary}`),
  ],
);
