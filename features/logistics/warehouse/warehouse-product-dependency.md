# Warehouse module: product dependency and deletion

The warehouse module depends on products. `warehouse.labels.product_id` and `warehouse.stocks.product_id` both point to `catalog.products` (`onDelete: 'restrict'`). Procurement items point to products as well. The warehouse therefore takes part in the catalog's deletion policy (see `product-deletion.md`) from both sides: it must stop creating new references to a product being deleted, and it must clear its existing references so the catalog purge can finish.

## Rule

**The warehouse never deletes a product and never blocks the catalog purge with stale data.**

1. A product in `pending_deletion` is unavailable to the warehouse. Any operation that would create a new reference to it must be rejected:
   - creating a label for the product
   - creating or increasing a stock of the product (`add_stock_quantity` with a positive delta)
   - creating a procurement item for the product
2. Operations that reduce or clear existing references stay allowed (decreasing quantity, moving stock out, deleting empty stocks, deleting orphan labels). Otherwise a product could never become deletable.
3. The product row itself is removed only by the catalog purge job, never by warehouse code.

## What blocks the product purge

A product can be purged only when none of these remain:

| Reference                                                 | Cleared by                                                                                               |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `stocks` rows (any quantity)                              | stock reaches 0, then the warehouse purge deletes it after the grace period (`graceDays`)                |
| `labels` rows                                             | no stock or other child references the label, then the warehouse purge deletes it after its grace period |
| `procurement_items` rows                                  | the owning procurement is removed, or the item is deleted                                                |
| external references (events, caches, printed labels, POS) | not protected by FKs: purge or invalidate them explicitly                                                |

Consequences:

- A product with **positive stock is never purgeable.** The stock must be sold, adjusted or moved to zero first.
- Because the warehouse purge applies grace periods, **a product stays in `pending_deletion` for at least the stock grace period plus the label grace period** after its last stock reaches 0. This is expected, not a bug.
- Local FKs are discovered from the PostgreSQL catalog by the catalog purge, so new warehouse tables that reference products are covered automatically. **Always index the FK column** in such tables (the purge probes them with `NOT EXISTS`).

## Dependency check for the catalog purge

If the warehouse lives in the same database, the catalog purge already sees its FKs and no extra code is needed.

If it is ever moved to another database, it must expose a check the catalog purge can call, for example:

```ts
hasProductReferences(productId: string): Promise<boolean>
```

It must return `true` when any label, stock or procurement item still points to the product. Any error, timeout or unknown answer must be treated by the caller as "still referenced" (fail closed).

## API behavior

- When the catalog marks a product `pending_deletion`, warehouse read APIs may still return its existing stocks and labels (they are real goods), but mark the product as being deleted so the UI can warn.
- Optional policy decision: the catalog delete API may reject the request with `409` while the product has positive stock, instead of accepting it and waiting. Pick one behavior and document it in the API.
- Restoring a product from `pending_deletion` to `active` re-enables all warehouse operations immediately.

## Code comment

```ts
// ---------------------------------------------------------------------------
// Product dependency policy (warehouse)
//
// labels, stocks and procurement items reference catalog.products
// (onDelete: 'restrict'). The warehouse never deletes products.
//
//   - Products in 'pending_deletion' must NOT receive new references:
//     reject new labels, new procurement items and positive stock deltas.
//   - Reducing or clearing references stays allowed. The warehouse purge
//     (empty stocks, then orphan labels) is what lets the catalog purge
//     finish.
//   - Positive stock always blocks deletion of the product.
//   - Every FK column that points to products must be indexed (the catalog
//     purge probes it with NOT EXISTS).
// ---------------------------------------------------------------------------
```
