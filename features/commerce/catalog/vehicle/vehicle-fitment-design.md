# طراحی Vehicle Hierarchy و Fitment

مستند راهنما برای ساخت، خواندن و نگهداری درخت خودرو (`make → model → series → vehicle`) و اتصال محصولات به هر سطح آن با یک FK ساده.

---

## ۱. مسئله و راه‌حل

**نیازها:**

- سلسله‌مراتب کامل و اجباری: `make ← model ← series ← vehicle`
- `vehicle` هیچ فیلد اختیاری ندارد (`series`، `transmission` و `fuel` همه اجباری‌اند)
- fitment بتواند به **هر سطح** اشاره کند (کل برند، کل مدل، کل series یا یک vehicle دقیق)
- fitment فقط **یک** FK داشته باشد، نه چهار ستون nullable با CHECK

**مشکل:** یک FK در دیتابیس فقط به یک جدول اشاره می‌کند، ولی ما چهار جدول داریم.

**راه‌حل:** یک جدول مشترک `vehicle_nodes`. هر گره از درخت یک ردیف در آن دارد، و fitment فقط به این جدول اشاره می‌کند.

---

## ۲. ساختار

هر موجودیت در دیتابیس **دو ردیف با یک id** دارد:

1. یک ردیف در `vehicle_nodes` (هویت و نوع)
2. یک ردیف در جدول تخصصی خودش (`makes`، `models`، `series`، `vehicles`)

`id` در جدول‌های تخصصی هم primary key است و هم FK به `vehicle_nodes.id`. این `id` را دیتابیس نمی‌سازد، از ردیف node می‌آید (پس `defaultRandom()` ندارد).

```
vehicle_nodes (id, kind)
     ▲  ▲  ▲  ▲        ← FK هویت: (id, kind)
     │  │  │  │
  makes models series vehicles
     ▲    │      │       │
     └────┘      │       │   ← FK والد-فرزند (NOT NULL)
          └──────┘       │
                 └───────┘

product_fitments (product_id, node_id) → vehicle_nodes.id
```

### دو نوع رابطه

| رابطه      | چطور                                                                     | هدف                                   |
| ---------- | ------------------------------------------------------------------------ | ------------------------------------- |
| هویت       | FK ترکیبی `(id, kind)` از جدول تخصصی به `vehicle_nodes` + CHECK          | make فقط به گرهٔ `kind='make'` وصل شود |
| والد-فرزند | `vehicles.series_id`، `series.model_id`، `models.make_id` (همه NOT NULL) | درخت ناقص نشود                        |

---

## ۳. نمونه داده

```
Toyota (make)
 └── Corolla (model)
      └── GLI (series)
           ├── GLI + Automatic + Petrol  (vehicle)
           └── GLI + Manual + Petrol     (vehicle)
```

**vehicle_nodes**

| id  | kind    |
| --- | ------- |
| A1  | make    |
| B2  | model   |
| C3  | series  |
| D4  | vehicle |
| D5  | vehicle |

**makes**: `A1 | make | Toyota | toyota`

**models**: `B2 | model | make_id=A1 | Corolla | corolla`

**series**: `C3 | series | model_id=B2 | GLI | gli`

**vehicles**

| id  | series_id | transmission | fuel   |
| --- | --------- | ------------ | ------ |
| D4  | C3        | automatic    | petrol |
| D5  | C3        | manual       | petrol |

**product_fitments**

| product_id | node_id | معنی                             |
| ---------- | ------- | -------------------------------- |
| P1         | A1      | روی همهٔ تویوتاها                 |
| P2         | B2      | روی همهٔ Corollaها                |
| P3         | C3      | روی همهٔ GLIها (هر گیربکس و سوخت) |
| P4         | D4      | فقط GLI اتوماتیک بنزینی          |

---

## ۴. کد Schema

```ts
// catalog/vehicles.schema.ts
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

import { catalogSchema } from './catalog.schema';
import { products } from './products.schema';
import { slugChecks } from './slug-checks';
import { mimeTypes } from './media-files.schema';
import { createImageTable } from './media/media-tables';

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
  (t) => [...nodeChecks('makes', 'make', t), ...slugChecks('makes', t.slug)],
);

export const models = catalogSchema.table(
  'models',
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
    ...slugChecks('models', t.slug),
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
    ...slugChecks('series', t.slug),
  ],
);

export const transmissions = catalogSchema.table(
  'transmissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull().unique(),
    slug: text('slug').notNull().unique(),
  },
  (t) => [...slugChecks('transmissions', t.slug)],
);

export const fuels = catalogSchema.table(
  'fuels',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull().unique(),
    slug: text('slug').notNull().unique(),
  },
  (t) => [...slugChecks('fuels', t.slug)],
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

// تصاویر
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
```

---

## ۵. ساخت داده (Create)

### قاعده

برای هر گره **همیشه دو insert داخل یک transaction**:

1. insert در `vehicle_nodes` با `kind` مناسب و گرفتن `id`
2. insert در جدول تخصصی با همان `id`

### Helper مشترک

```ts
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const createNode = async (
  tx: Tx,
  kind: 'make' | 'model' | 'series' | 'vehicle',
) => {
  const [node] = await tx
    .insert(vehicleNodes)
    .values({ kind })
    .returning({ id: vehicleNodes.id });
  return node.id;
};
```

### ساخت هر سطح

```ts
export const createMake = (input: { name: string; slug: string }) =>
  db.transaction(async (tx) => {
    const id = await createNode(tx, 'make');
    const [row] = await tx
      .insert(makes)
      .values({ id, ...input })
      .returning();
    return row;
  });

export const createModel = (input: {
  makeId: string;
  name: string;
  slug: string;
}) =>
  db.transaction(async (tx) => {
    const id = await createNode(tx, 'model');
    const [row] = await tx
      .insert(models)
      .values({ id, ...input })
      .returning();
    return row;
  });

export const createSeries = (input: {
  modelId: string;
  name: string;
  slug: string;
}) =>
  db.transaction(async (tx) => {
    const id = await createNode(tx, 'series');
    const [row] = await tx
      .insert(series)
      .values({ id, ...input })
      .returning();
    return row;
  });

export const createVehicle = (input: {
  seriesId: string;
  transmissionId: string;
  fuelId: string;
}) =>
  db.transaction(async (tx) => {
    const id = await createNode(tx, 'vehicle');
    const [row] = await tx
      .insert(vehicles)
      .values({ id, ...input })
      .returning();
    return row;
  });
```

> نیازی نیست `kind` را در insert جدول تخصصی بدهی؛ مقدار پیش‌فرض آن (`'make'`، `'model'`، ...) درست است و CHECK و FK ترکیبی آن را اعتبارسنجی می‌کنند.

### ساخت fitment

```ts
export const addFitment = (productId: string, nodeId: string, note?: string) =>
  db
    .insert(productFitments)
    .values({ productId, nodeId, note })
    .onConflictDoNothing(); // unique (productId, nodeId)
```

`nodeId` می‌تواند id یک make، model، series یا vehicle باشد. هیچ تفاوتی در کد نیست.

---

## ۶. خواندن داده (Read)

### ۶.۱ محصولات سازگار با یک vehicle (بالا رفتن در درخت)

fitment برای vehicle معتبر است اگر `node_id` آن یکی از این چهار باشد: خود vehicle، series، model یا make آن.

```ts
import { eq, sql } from 'drizzle-orm';

export const productsForVehicle = (vehicleId: string) =>
  db
    .selectDistinct({ productId: productFitments.productId })
    .from(vehicles)
    .innerJoin(series, eq(series.id, vehicles.seriesId))
    .innerJoin(models, eq(models.id, series.modelId))
    .innerJoin(
      productFitments,
      sql`${productFitments.nodeId} in (${vehicles.id}, ${series.id}, ${models.id}, ${models.makeId})`,
    )
    .where(eq(vehicles.id, vehicleId));
```

برای مثال بخش ۳:

| vehicle       | محصولات برگشتی  |
| ------------- | -------------- |
| D4 (اتوماتیک) | P1، P2، P3، P4 |
| D5 (دستی)     | P1، P2، P3     |

### ۶.۲ همین query با نمایش سطح fitment

```ts
export const fitmentsForVehicle = (vehicleId: string) =>
  db
    .select({
      productId: productFitments.productId,
      nodeId: productFitments.nodeId,
      level: vehicleNodes.kind,
      note: productFitments.note,
    })
    .from(vehicles)
    .innerJoin(series, eq(series.id, vehicles.seriesId))
    .innerJoin(models, eq(models.id, series.modelId))
    .innerJoin(
      productFitments,
      sql`${productFitments.nodeId} in (${vehicles.id}, ${series.id}, ${models.id}, ${models.makeId})`,
    )
    .innerJoin(vehicleNodes, eq(vehicleNodes.id, productFitments.nodeId))
    .where(eq(vehicles.id, vehicleId));
```

سطح (`make`/`model`/`series`/`vehicle`) از `vehicle_nodes.kind` می‌آید و در fitment ذخیره نمی‌شود.

### ۶.۳ fitmentهای یک محصول، با نام هدف

هدف می‌تواند هر چهار نوع باشد، پس join را LEFT می‌زنیم و با `kind` انتخاب می‌کنیم:

```ts
export const fitmentsForProduct = (productId: string) =>
  db
    .select({
      nodeId: vehicleNodes.id,
      kind: vehicleNodes.kind,
      makeName: makes.name,
      modelName: models.name,
      seriesName: series.name,
    })
    .from(productFitments)
    .innerJoin(vehicleNodes, eq(vehicleNodes.id, productFitments.nodeId))
    .leftJoin(makes, eq(makes.id, vehicleNodes.id))
    .leftJoin(models, eq(models.id, vehicleNodes.id))
    .leftJoin(series, eq(series.id, vehicleNodes.id))
    .where(eq(productFitments.productId, productId));
```

برای `kind = 'vehicle'` باید vehicle را هم join کنی و series و model و make آن را بخوانی؛ بسته به UI یک query جدا برای vehicleها ساده‌تر است.

### ۶.۴ محصولات یک make یا model (پایین رفتن در درخت)

وقتی کاربر صفحهٔ «قطعات تویوتا» را باز می‌کند، معمولاً می‌خواهی fitmentهای **همهٔ زیرمجموعه‌ها** هم نمایش داده شوند. با عمق ثابت ۴ سطح، یک CTE ساده کافی است:

```ts
export const productsForMake = async (makeId: string) => {
  const { rows } = await db.execute(sql`
    with nodes as (
      select ${makeId}::uuid as id
      union
      select m.id from ${models} m where m.make_id = ${makeId}
      union
      select s.id from ${series} s
        join ${models} m on m.id = s.model_id
        where m.make_id = ${makeId}
      union
      select v.id from ${vehicles} v
        join ${series} s on s.id = v.series_id
        join ${models} m on m.id = s.model_id
        where m.make_id = ${makeId}
    )
    select distinct f.product_id
    from ${productFitments} f
    join nodes n on n.id = f.node_id
  `);
  return rows;
};
```

> معنی این query «محصولاتی که حداقل روی یک زیرمجموعهٔ این make جواب می‌دهند» است، نه «روی همهٔ آن». این تفاوت را در UI روشن نگه دار.

### ۶.۵ لیست درخت برای UI (انتخاب خودرو)

برای dropdownهای آبشاری هر سطح یک query ساده روی جدول تخصصی است:

```ts
// سطح ۱
db.select().from(makes).orderBy(makes.name);

// سطح ۲
db.select().from(models).where(eq(models.makeId, makeId)).orderBy(models.name);

// سطح ۳
db.select()
  .from(series)
  .where(eq(series.modelId, modelId))
  .orderBy(series.name);

// سطح ۴
db.select({
  id: vehicles.id,
  transmission: transmissions.name,
  fuel: fuels.name,
})
  .from(vehicles)
  .innerJoin(transmissions, eq(transmissions.id, vehicles.transmissionId))
  .innerJoin(fuels, eq(fuels.id, vehicles.fuelId))
  .where(eq(vehicles.seriesId, seriesId));
```

---

## ۷. حذف (Delete)

حذف را همیشه از `vehicle_nodes` انجام بده، نه از جدول تخصصی. cascade ردیف تخصصی را هم پاک می‌کند:

```ts
export const deleteNode = (nodeId: string) =>
  db.delete(vehicleNodes).where(eq(vehicleNodes.id, nodeId));
```

رفتار قفل‌ها:

| وضعیت                              | نتیجه                                            |
| ---------------------------------- | ------------------------------------------------ |
| گره فرزند دارد (مثلاً make با model) | خطا (`restrict` روی `models.make_id` و ...)      |
| گره fitment دارد                   | خطا (`restrict` روی `product_fitments.node_id`)  |
| گره بدون فرزند و fitment           | حذف می‌شود و ردیف تخصصی هم cascade پاک می‌شود      |
| لینک‌های تصویر گره                  | cascade پاک می‌شوند (فایل در `mediaFiles` می‌ماند) |
| حذف product                        | fitmentهایش cascade پاک می‌شوند                   |

> اگر فقط ردیف تخصصی را حذف کنی، یک گرهٔ یتیم در `vehicle_nodes` می‌ماند. به همین دلیل حذف از `vehicle_nodes` توصیه می‌شود.

---

## ۸. نکات مهم

### ۸.۱ گرهٔ یتیم (Orphan Node)

دیتابیس جلوی ردیفی در `vehicle_nodes` بدون ردیف تخصصی را **نمی‌گیرد**. چنین گره‌ای می‌تواند fitment بگیرد، ولی هیچ vehicle یا make ای به آن نمی‌رسد.

- اگر همهٔ نوشتن‌ها از طریق اپلیکیشن و transaction است، مشکلی پیش نمی‌آید.
- اگر ردیف‌ها مستقیم با SQL ساخته می‌شوند، یک `DEFERRABLE INITIALLY DEFERRED` constraint trigger بنویس (Drizzle مستقیم پشتیبانی نمی‌کند، در migration دستی اضافه می‌شود).
- یک query دوره‌ای برای پیدا کردن یتیم‌ها مفید است:

```sql
select n.id, n.kind
from catalog.vehicle_nodes n
left join catalog.makes    m on m.id = n.id
left join catalog.models   d on d.id = n.id
left join catalog.series   s on s.id = n.id
left join catalog.vehicles v on v.id = n.id
where m.id is null and d.id is null and s.id is null and v.id is null;
```

### ۸.۲ هر model باید حداقل یک series داشته باشد

چون `vehicles.series_id` اجباری است، مدلی که series ندارد نمی‌تواند vehicle بگیرد. راه‌حل رایج: برای مدل‌های بدون series یک series پیش‌فرض مثل `standard` بساز.

### ۸.۳ fitmentهای هم‌پوشان

اگر محصولی هم روی `make` و هم روی یک `vehicle` همان make fitment دارد، unique جلویش را نمی‌گیرد. query شماره ۶.۱ با `selectDistinct` درست کار می‌کند. اگر می‌خواهی ادمین را آگاه کنی، در لایهٔ اپلیکیشن بررسی کن.

### ۸.۴ fitment معنی «شمول» دارد

fitment روی یک گره یعنی «همهٔ زیرمجموعه‌های آن گره». هیچ مفهومی از «همه به‌جز فلان» وجود ندارد. اگر چنین نیازی دارید (exclusion)، یک جدول جدا برای استثناها لازم می‌شود.

### ۸.۵ slug

- `makes`، `transmissions`، `fuels`: slug سراسری unique
- `models`: unique داخل make
- `series`: unique داخل model
- نام اول `slugChecks(tableName, col)` باید با نام واقعی جدول یکی باشد.

### ۸.۶ هزینهٔ طراحی

- هر گره دو insert می‌خواهد (باید transaction باشد).
- در عوض fitment فقط یک FK ساده دارد و جدول‌های تخصصی type-safe و با ستون‌های مخصوص خودشان می‌مانند.

### ۸.۷ بدون نیاز به PostgreSQL 15

در طراحی فعلی `nullsNotDistinct()` استفاده نشده، چون هیچ ستون nullable‌ای در unique نیست.

### ۸.۸ جدول‌های تصویر

- `createImageTable` به owner با ستون `id` نیاز دارد؛ `makes` و `vehicles` این را دارند.
- `unique(file_id)` در هر جدول تصویر یعنی یک فایل نمی‌تواند در دو vehicle تکرار شود. اگر عکس مشترک می‌خواهی، عکس را روی `series` یا `model` بگذار (با همان `createImageTable`).
- اعتبارسنجی magic bytes فایل هنگام آپلود در لایهٔ اپلیکیشن انجام شود؛ CHECK دیتابیس فقط mime ثبت‌شده را می‌بیند.
- برای SVG لوگو، sanitize یا سرو امن (CSP و `Content-Disposition`) لازم است.

---

## ۹. Migration

1. `drizzle-kit generate` بعد از تغییر schema.
2. اگر داده موجود دارید، ترتیب امن:
   1. ساخت `vehicle_nodes` و enum `vehicle_node_kind`.
   2. برای هر ردیف موجود در `makes`/`models`/`series`/`vehicles` یک ردیف در `vehicle_nodes` با **همان id** و `kind` مناسب insert کن.
   3. اضافه کردن ستون `kind` به جدول‌های تخصصی (با default).
   4. اضافه کردن FK ترکیبی و CHECKها.
   5. `slug` اگر جدید است: اول nullable، پر کردن، بعد `NOT NULL` و checkها.
3. انتقال fitmentهای قدیمی (اگر ساختار چهار ستونی داشتند):

```sql
update catalog.product_fitments
set node_id = coalesce(vehicle_id, series_id, model_id, make_id);
```

4. ردیف‌های قدیمی `vehicles` که `series`، `transmission` یا `fuel` ندارند باید قبل از NOT NULL شدن اصلاح یا حذف شوند.

---

## ۱۰. خلاصه

| مفهوم                          | نقش                                         |
| ------------------------------ | ------------------------------------------- |
| `vehicle_nodes`                | شناسنامهٔ هر گره (id و نوع)، هدف fitment     |
| `makes/models/series/vehicles` | اطلاعات واقعی هر سطح، با همان id             |
| FK والد-فرزند                  | ساختار درخت، همه NOT NULL                   |
| FK ترکیبی `(id, kind)`         | نوع گره اشتباه نمی‌شود                       |
| `product_fitments.node_id`     | اشاره به یک گره از هر سطح                   |
| خواندن برای vehicle            | `node_id in (vehicle, series, model, make)` |
| خواندن برای make/model         | CTE روی زیرمجموعه‌ها                         |
| ساخت                           | همیشه دو insert داخل transaction            |
| حذف                            | از `vehicle_nodes`                          |
