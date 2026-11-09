# Categories Module

Hierarchical product categories (tree) with a many-to-many link to products.
Built with **Drizzle ORM + PostgreSQL** in a NestJS service. No triggers, no custom SQL migrations.

Files:

| File                    | Purpose                                            |
| ----------------------- | -------------------------------------------------- |
| `categories.schema.ts`  | Drizzle tables: `categories`, `product_categories` |
| `categories.service.ts` | All write operations and the business rules        |

---

## 1. Data Model

### `categories` (adjacency list)

| Column                      | Type           | Notes                                                               |
| --------------------------- | -------------- | ------------------------------------------------------------------- |
| `id`                        | uuid PK        | `defaultRandom()`                                                   |
| `parent_id`                 | uuid, nullable | `NULL` = root category. FK to `categories.id`, `ON DELETE RESTRICT` |
| `name`                      | text           | Display name                                                        |
| `slug`                      | text           | URL-safe identifier (validated by `slugChecks`)                     |
| `sort_order`                | integer        | Display order among siblings (default `0`)                          |
| `is_active`                 | boolean        | Visibility flag (default `true`)                                    |
| `created_at` / `updated_at` | timestamptz    | `updated_at` is refreshed via `$onUpdate`                           |

Constraints and indexes:

- `categories_not_self_parent_chk`: a category cannot be its own parent.
- `categories_parent_slug_unique` on `(parent_id, slug)` with `NULLS NOT DISTINCT`: slugs are unique among siblings, **including root categories** (by default Postgres treats `NULL`s as distinct, which would allow duplicate root slugs).
- `categories_parent_sort_idx` on `(parent_id, sort_order)`: fast ordered child listing.

The same slug may appear under different parents (`men/shoes` and `women/shoes`).

### `product_categories` (join table)

| Column        | Type        | Notes                                          |
| ------------- | ----------- | ---------------------------------------------- |
| `product_id`  | uuid        | FK to `products.id`, `ON DELETE CASCADE`       |
| `category_id` | uuid        | FK to `categories.id`, `ON DELETE RESTRICT`    |
| `is_primary`  | boolean     | The product's main category (breadcrumbs, SEO) |
| `created_at`  | timestamptz |                                                |

Constraints and indexes:

- Composite PK `(product_id, category_id)`: no duplicate links.
- Index on `category_id`: the PK only speeds up lookups by `product_id`.
- Partial unique index on `(product_id) WHERE is_primary`: **at most one** primary category per product.

---

## 2. Business Rules

| #   | Rule                                                                                       | Enforced by             |
| --- | ------------------------------------------------------------------------------------------ | ----------------------- |
| 1   | A category cannot be its own parent                                                        | DB check constraint     |
| 2   | Sibling slugs are unique (roots included)                                                  | DB unique constraint    |
| 3   | A category with children cannot be deleted                                                 | DB FK `RESTRICT`        |
| 4   | A category linked to products cannot be deleted                                            | DB FK `RESTRICT`        |
| 5   | At most one primary category per product                                                   | DB partial unique index |
| 6   | Products attach **only to leaf categories**                                                | **Service**             |
| 7   | No cycles in the tree (A → B → A)                                                          | **Service**             |
| 8   | Exactly one primary per product (at least one)                                             | **Service**             |
| 9   | Adding a child under a category that has products moves those products to an `other` child | **Service**             |

> **Important:** rules 6 to 9 are **not** guaranteed by the database. They hold only if every write to
> `categories` and `product_categories` goes through `CategoriesService`. Do not write to these tables
> directly from other modules, seeds, or ad-hoc scripts without applying the same rules.

---

## 3. Example Tree

```
electronics                 (parent: NULL)
├─ mobile-phones
│  ├─ smartphones           <- leaf, products attach here
│  └─ accessories           <- leaf
└─ laptops
   ├─ gaming-laptops        <- leaf
   └─ other                 <- auto-created leaf (see "The other pattern")

fashion
├─ men
│  └─ shoes
└─ women
   └─ shoes                 <- same slug, different parent: allowed
```

Example product links:

| Product     | Categories                           |
| ----------- | ------------------------------------ |
| iPhone 16   | `smartphones` (primary)              |
| MacBook Air | `laptops/other` (primary)            |
| Power bank  | `accessories` (primary)              |
| Nike Air    | `men/shoes` (primary), `women/shoes` |

Parents such as `electronics` are **not** linked to products; they are reached through the tree.

---

## 4. Writing

All writes are in `CategoriesService` and run inside a transaction.

### 4.1 Create a category

```ts
// root category
await categoriesService.create({
  parentId: null,
  name: 'Electronics',
  slug: 'electronics',
});

// child category
await categoriesService.create({
  parentId: electronicsId,
  name: 'Laptops',
  slug: 'laptops',
});
```

What happens:

1. The parent row is locked with `SELECT ... FOR UPDATE`.
2. If the parent currently has products, they are moved to a child with slug `other` (created if missing).
3. The new category is inserted.

### 4.2 Move a category

```ts
await categoriesService.move(categoryId, newParentId); // or null to make it a root
```

- Rejects moving a category under itself or under any of its descendants (`cycle detected`).
- Locks both rows in a fixed order (sorted by id) to avoid deadlocks.
- If the new parent has products, they are moved to its `other` child first.

### 4.3 Assign categories to a product

```ts
await categoriesService.setProductCategories(
  productId,
  [menShoesId, womenShoesId], // all categories
  menShoesId, // primary (must be in the list)
);
```

- **Replaces** the product's existing links (delete + insert) in one transaction.
- Every category must exist and be a **leaf**.
- `primaryId` must be included in `categoryIds`.
- Categories are locked with `FOR SHARE`, which conflicts with the `FOR UPDATE` taken by `create`/`move`.
  This closes the race "one request attaches a product while another adds a child".

To remove all categories from a product, pass an empty list only if your service allows it
(the current implementation requires a primary, so it throws). Add a dedicated method if you need this.

### 4.4 The `other` pattern

When a leaf with products receives its first child, those products need somewhere to go.
The service creates `other` (name: `سایر <parent name>`, `sort_order = 9999`) under that parent
and moves the products there. This keeps the "leaf only" rule intact without losing data.
Rename or redistribute the products later from your admin panel.

---

## 5. Reading

The service exposes write operations. Below are read recipes you can add to a query service.
All use plain Drizzle.

### 5.1 Root categories

```ts
import { and, asc, eq, isNull } from 'drizzle-orm';

const roots = await db
  .select()
  .from(categories)
  .where(and(isNull(categories.parentId), eq(categories.isActive, true)))
  .orderBy(asc(categories.sortOrder), asc(categories.name));
```

### 5.2 Direct children of a category

```ts
const children = await db
  .select()
  .from(categories)
  .where(and(eq(categories.parentId, parentId), eq(categories.isActive, true)))
  .orderBy(asc(categories.sortOrder), asc(categories.name));
```

Uses `categories_parent_sort_idx`.

### 5.3 Whole tree in memory

For a typical shop (hundreds or a few thousand categories) loading everything once and building the tree
in JS is the simplest and fastest approach. Cache it and invalidate on any write.

```ts
type Node = typeof categories.$inferSelect & { children: Node[] };

async function loadTree(): Promise<Node[]> {
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  const byId = new Map<string, Node>(
    rows.map((r) => [r.id, { ...r, children: [] }]),
  );
  const roots: Node[] = [];

  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else if (!node.parentId) roots.push(node); // children of inactive parents are dropped
  }
  return roots;
}
```

Because inactive categories are filtered out and orphaned children are skipped,
**deactivating a parent hides its whole subtree**.

### 5.4 Breadcrumb for a category

```ts
async function breadcrumb(categoryId: string) {
  const trail: { id: string; name: string; slug: string }[] = [];
  let cursor: string | null = categoryId;

  while (cursor) {
    const [row] = await db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        parentId: categories.parentId,
      })
      .from(categories)
      .where(eq(categories.id, cursor));
    if (!row) break;
    trail.unshift({ id: row.id, name: row.name, slug: row.slug });
    cursor = row.parentId;
  }
  return trail;
}
```

Depth is small (3 to 5 levels), so one query per level is fine. For a product, start from its primary category.

### 5.5 Categories of a product

```ts
const rows = await db
  .select({
    id: categories.id,
    name: categories.name,
    slug: categories.slug,
    isPrimary: productCategories.isPrimary,
  })
  .from(productCategories)
  .innerJoin(categories, eq(categories.id, productCategories.categoryId))
  .where(eq(productCategories.productId, productId))
  .orderBy(desc(productCategories.isPrimary), asc(categories.name));
```

### 5.6 Products of a category including all descendants

Products attach only to leaves, so collect the leaf ids under the category first, then query.

```ts
import { inArray } from 'drizzle-orm';

async function descendantIds(rootId: string): Promise<string[]> {
  const ids = [rootId];
  let frontier = [rootId];

  while (frontier.length) {
    const rows = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          inArray(categories.parentId, frontier),
          eq(categories.isActive, true),
        ),
      );
    frontier = rows.map((r) => r.id);
    ids.push(...frontier);
  }
  return ids;
}

const ids = await descendantIds(categoryId);

const items = await db
  .selectDistinct({ id: products.id, name: products.name })
  .from(productCategories)
  .innerJoin(products, eq(products.id, productCategories.productId))
  .where(inArray(productCategories.categoryId, ids));
```

`selectDistinct` matters because a product can sit in several categories of the same subtree.
One query per tree level; if you later need a single query, use a recursive CTE (raw SQL) or `ltree`.

---

## 6. Concurrency Notes

- `create` and `move` take `FOR UPDATE` on the affected parent(s).
- `setProductCategories` takes `FOR SHARE` on the target categories.
- Multiple rows are always locked **sorted by id** to prevent deadlocks.
- These locks serialize "attach product" against "add child / move under", which is exactly the race
  a database trigger would otherwise guard against.
- Two requests creating the same `other` child concurrently are handled by `onConflictDoNothing()`
  on `(parent_id, slug)` followed by a lookup.

---

## 7. Deleting

There is no delete method yet. When you add one:

1. Lock the category (`FOR UPDATE`).
2. Fail with a clear error if it has children or products (the FKs would reject it anyway with a raw DB error).
3. Delete the row.

Consider soft-delete via `is_active = false` instead, so URLs and historical references stay valid.

---

## 8. Known Limitations

- **DB-level guarantees are partial** (see section 2). Direct SQL or other services can break the leaf-only and
  no-cycle rules.
- **"At least one primary"** is guaranteed only by `setProductCategories`.
- **`is_active` is not cascaded** in the database. Read queries must exclude inactive subtrees (section 5.3).
- **Slug uniqueness is per parent.** If you need globally unique URLs, build them from the full path
  (`electronics/laptops/gaming-laptops`) and resolve by walking the tree.
- **Renaming or moving a category changes paths.** If you store or expose full-path URLs, plan for redirects.
- **Large or very deep trees.** If reads become a bottleneck, migrate to a materialized path, `ltree`,
  or a closure table. For a normal shop the adjacency list is enough.

---

## 9. Checklist When Extending

- [ ] Every new write path goes through `CategoriesService` (or applies the same rules in a transaction).
- [ ] Locks are taken before reads that the decision depends on.
- [ ] Multiple locks are acquired in sorted id order.
- [ ] Read queries filter `is_active` and skip subtrees of inactive parents.
- [ ] The tree cache (if any) is invalidated after `create` and `move`.
