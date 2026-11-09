import { commerceSchema } from '@commerce/schema';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  integer,
  text,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  createDocumentTable,
  createImageTable,
} from '../media/helpers/media-tables';
import {
  createLabelTables,
  labelCodeRegExp,
} from '../public/helpers/create-label-table';
import { brands } from './brands.schema';
import { catalogItems } from './catalog-items.schema';

export const baseUoM = commerceSchema.enum('base_unit_of_measure', [
  'piece',
  'pair',
  'set',
]);

export const packagingType = commerceSchema.enum('packaging_type', [
  'carton',
  'shrink',
  'pack',
]);

export const products = commerceSchema.table(
  'products',
  {
    id: uuid('id')
      .references(() => catalogItems.id, { onDelete: 'cascade' })
      .notNull(),

    // units
    baseUoM: baseUoM('base_unit_of_measure').notNull(),
    perSet: integer('per_set'),

    storefront: boolean('storefront').default(false).notNull(),
    displayName: text('display_name'),

    brandId: uuid('brand_id').references(() => brands.id, {
      onDelete: 'restrict',
    }),
  },
  (t) => [
    check(
      'products_per_set_chk',
      sql`(
    ${t.baseUoM} = 'set' AND ${t.perSet} IS NOT NULL AND ${t.perSet} > 1
  ) OR (
    ${t.baseUoM} <> 'set' AND ${t.perSet} IS NULL
  )`,
    ),
  ],
);

export const productPackagings = commerceSchema.table(
  'product_packagings',
  {
    productId: uuid('product_id').primaryKey(),

    baseUoM: baseUoM('base_unit_of_measure').notNull(),

    type: packagingType('type').notNull(),

    perPack: integer('per_pack').notNull(),
  },
  (t) => [
    foreignKey({
      name: 'product_packagings_product_uom_fk',
      columns: [t.productId, t.baseUoM],
      foreignColumns: [products.id, products.baseUoM],
    }).onDelete('cascade'),

    check('per_pack_positive_chk', sql`${t.perPack} > 0`),
  ],
);

export const productsImages = createImageTable(commerceSchema, products, {
  name: 'product_logos',
  onOwnerDelete: 'cascade',
  relation: 'toMany',
});

export const productDescriptions = createDocumentTable(
  commerceSchema,
  products,
  {
    name: 'product_descriptions',
    onOwnerDelete: 'cascade',
    relation: 'toOne', // one description page per product
    mimes: ['text/markdown', 'text/mdx'],
  },
);

/** [NOTE] Use labels when products has no barcodes */
const PRODUCT_LABEL_PREFIX = 'P';
export const {
  counter: _,
  freeSeqs: __,
  labels: productLabels,
} = createLabelTables(commerceSchema, products, PRODUCT_LABEL_PREFIX);

export const productLabelRegExp = labelCodeRegExp(PRODUCT_LABEL_PREFIX);
