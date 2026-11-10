import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  unique,
  varchar,
} from 'drizzle-orm/pg-core';

export const provinces = pgTable(
  'provinces',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    name: varchar('name', { length: 100 }).notNull(),
  },
  (t) => [
    unique('provinces_name_unique').on(t.name),
    check('provinces_name_not_blank', sql`length(trim(${t.name})) > 0`),
  ],
);

export const cities = pgTable(
  'cities',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    name: varchar('name', { length: 100 }).notNull(),
    provinceId: integer('province_id')
      .notNull()
      .references(() => provinces.id, { onDelete: 'cascade' }),
  },
  (t) => [
    unique('cities_province_name_unique').on(t.provinceId, t.name),
    index('cities_province_id_idx').on(t.provinceId),
    check('cities_name_not_blank', sql`length(trim(${t.name})) > 0`),
  ],
);
