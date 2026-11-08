import { InvoiceItem, LineItems, ProductInvoiceItem } from '@feature/shared';

export function flattenInvoiceItem(
  item: InvoiceItem,
): readonly ProductInvoiceItem[] {
  if (item.kind === 'leaf') {
    return [item];
  }

  return item.items.map((bundleItem) => ({
    kind: 'leaf',
    productId: bundleItem.productId,
    description: bundleItem.description,
    quantity: bundleItem.quantity * item.quantity,
    unitPrice: bundleItem.unitPrice,
    lineTotal: bundleItem.lineTotal,
  }));
}

export function flattenInvoiceItems(
  items: LineItems<InvoiceItem>,
): LineItems<ProductInvoiceItem> {
  const result = new LineItems<ProductInvoiceItem>((p) => p.productId);

  for (const item of items) {
    if (item.kind === 'leaf') {
      result.set(item);
      continue;
    }

    for (const bundleItem of item.items) {
      const quantity = bundleItem.quantity * item.quantity;

      const existing = result.get(item.productId);

      if (existing) {
        result.set({
          ...existing,
          quantity: existing.quantity + quantity,
        });
      } else {
        result.set({
          kind: 'leaf',
          productId: bundleItem.productId,
          description: bundleItem.description,
          quantity,
          unitPrice: bundleItem.unitPrice,
          lineTotal: bundleItem.lineTotal,
        });
      }
    }
  }

  return result;
}
