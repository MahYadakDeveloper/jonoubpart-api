# Catalog module: product deletion

Products are referenced from other databases (orders, sales, POS) that this module cannot see through foreign keys. A plain `DELETE` on a product is therefore never safe: the local FKs only protect references inside this database, and the external ones are invisible to it.

## Rule

**A delete request never deletes the product. It marks it for deletion.**

1. The delete API sets the product's status to `pending_deletion` ("to be purged") and returns immediately.
2. A product in `pending_deletion` must be treated as unavailable: hidden from listings and search, and rejected by any API that would create new references to it (new orders, new sales, new POS items, new labels, new procurement items).
3. A purge job later removes the product, but only when it is certain that nothing depends on it any more.

## Purge job

On every invocation, the job must:

1. Select products in `pending_deletion`.
2. For each one, **re-check every dependency**, both local and external:
   - **Local:** every table with an FK to `catalog.products` (discover them from the PostgreSQL catalog, as the warehouse purge does) must have no referencing row.
   - **External:** ask each dependent system (orders, sales, POS) whether it still holds references to the product. Treat any error, timeout or unknown answer as "still referenced".
3. Delete only the products for which **all** checks report no dependencies. Skip the rest; they stay in `pending_deletion` and are re-checked on the next run.
4. After a successful delete, purge caches and publish a `product.deleted` event so other systems can clean up (prefer an outbox for delivery guarantees).

## Guarantees and constraints

- **Never trust a previous run.** Dependency checks are repeated each time, because new references can appear between runs (for example, a late sync from POS).
- **Fail closed.** If a dependency cannot be verified, do not delete.
- **Local FKs (`onDelete: 'restrict'`) are the last line of defence**, not the primary check. A `23503` error during purge means a reference appeared concurrently: roll back the batch and retry on the next run.
- **Batch and skip locked rows** (`FOR UPDATE SKIP LOCKED`) so several instances can run safely at the same time.
- **Restore is possible until purge.** Moving a product from `pending_deletion` back to `active` is allowed as long as it has not been purged. Document this in the API.
- **Historical data keeps its meaning.** Orders and sales must store the data they need (name, price, SKU) as a snapshot, or the product must never be purged while history refers to it.

## Code comment

```ts
// ---------------------------------------------------------------------------
// Product deletion policy
//
// Products are referenced by systems outside this database (orders, sales,
// POS) that foreign keys cannot protect. NEVER hard-delete a product from an
// API request. Instead:
//
//   1. The delete API sets status = 'pending_deletion' and returns.
//      Such products are hidden and must not receive new references.
//   2. The purge job re-checks, on EVERY run, that nothing references the
//      product any more (local FKs read from the catalog + every external
//      system). Unknown or failed checks count as "still referenced".
//   3. Only products with zero dependencies are deleted. The rest stay in
//      'pending_deletion' and are re-checked on the next run.
//
// FK restrict is the last line of defence, not the primary check.
// ---------------------------------------------------------------------------
```
