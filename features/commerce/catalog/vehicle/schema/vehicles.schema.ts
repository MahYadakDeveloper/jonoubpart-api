import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { createImageTable } from '../media/helpers/media-tables';
import { mimeTypes } from '../media/media-files.schema';
import { catalogSchema } from './catalog.schema';
import { slugChecks } from './helpers/slug-checks';
import { products } from './products.schema';

export const vehicleNodeKind = catalogSchema.enum('vehicle_node_kind', [
  'make',
  'model',
  'series',
  'vehicle',
]);

export const vehicleNodes = catalogSchema.table(
  'vehicle_nodes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    kind: vehicleNodeKind('kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique('vehicle_nodes_id_kind_unique').on(t.id, t.kind)],
);

export const nodeChecks = (
  tableName: string,
  kind: (typeof vehicleNodeKind.enumValues)[number],
  t: { id: AnyPgColumn; kind: AnyPgColumn },
) => [
  check(`${tableName}_kind_chk`, sql`${t.kind} = ${kind}`),
  foreignKey({
    name: `${tableName}_node_fk`,
    columns: [t.id, t.kind],
    foreignColumns: [vehicleNodes.id, vehicleNodes.kind],
  }).onDelete('cascade'),
];

export const makes = catalogSchema.table(
  'makes',
  {
    id: uuid('id').primaryKey(),
    kind: vehicleNodeKind('kind').notNull().default('make'),
    name: text('name').notNull().unique(),
    slug: text('slug').notNull().unique(),
  },
  (t) => [...nodeChecks('makes', 'make', t), ...slugChecks(t.slug)],
);

export const models = catalogSchema.table(
  'vehicle_models',
  {
    id: uuid('id').primaryKey(),
    kind: vehicleNodeKind('kind').notNull().default('model'),
    makeId: uuid('make_id')
      .notNull()
      .references(() => makes.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
  },
  (t) => [
    ...nodeChecks('models', 'model', t),
    unique('models_make_name_unique').on(t.makeId, t.name),
    unique('models_make_slug_unique').on(t.makeId, t.slug),
    index('models_make_idx').on(t.makeId),
    ...slugChecks(t.slug),
  ],
);

export const series = catalogSchema.table(
  'series',
  {
    id: uuid('id').primaryKey(),
    kind: vehicleNodeKind('kind').notNull().default('series'),
    modelId: uuid('model_id')
      .notNull()
      .references(() => models.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
  },
  (t) => [
    ...nodeChecks('series', 'series', t),
    unique('series_model_name_unique').on(t.modelId, t.name),
    unique('series_model_slug_unique').on(t.modelId, t.slug),
    index('series_model_idx').on(t.modelId),
    ...slugChecks(t.slug),
  ],
);

export const transmissions = catalogSchema.table(
  'transmissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull().unique(),
    slug: text('slug').notNull().unique(),
  },
  (t) => [...slugChecks(t.slug)],
);

export const fuels = catalogSchema.table(
  'fuels',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull().unique(),
    slug: text('slug').notNull().unique(),
  },
  (t) => [...slugChecks(t.slug)],
);

export const vehicles = catalogSchema.table(
  'vehicles',
  {
    id: uuid('id').primaryKey(),
    kind: vehicleNodeKind('kind').notNull().default('vehicle'),
    seriesId: uuid('series_id')
      .notNull()
      .references(() => series.id, { onDelete: 'restrict' }),
    transmissionId: uuid('transmission_id')
      .notNull()
      .references(() => transmissions.id, { onDelete: 'restrict' }),
    fuelId: uuid('fuel_id')
      .notNull()
      .references(() => fuels.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    ...nodeChecks('vehicles', 'vehicle', t),
    unique('vehicles_identity_unique').on(
      t.seriesId,
      t.transmissionId,
      t.fuelId,
    ),
    index('vehicles_series_idx').on(t.seriesId),
    index('vehicles_transmission_idx').on(t.transmissionId),
    index('vehicles_fuel_idx').on(t.fuelId),
  ],
);

export const productFitments = catalogSchema.table(
  'product_fitments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    nodeId: uuid('node_id')
      .notNull()
      .references(() => vehicleNodes.id, { onDelete: 'restrict' }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('product_fitments_product_node_unique').on(t.productId, t.nodeId),
    index('product_fitments_node_idx').on(t.nodeId),
  ],
);

export const makeLogos = createImageTable(catalogSchema, makes, {
  name: 'make_logos',
  onOwnerDelete: 'cascade',
  relation: 'toOne',
  mimes: ['image/png', 'image/svg+xml', 'image/webp'],
});

const VEHICLE_IMAGE_MIMES = mimeTypes.image.filter(
  (m) => m !== 'image/svg+xml' && m !== 'image/gif',
);

export const vehicleImages = createImageTable(catalogSchema, vehicles, {
  name: 'vehicle_images',
  onOwnerDelete: 'cascade',
  relation: 'toMany',
  mimes: VEHICLE_IMAGE_MIMES,
});
