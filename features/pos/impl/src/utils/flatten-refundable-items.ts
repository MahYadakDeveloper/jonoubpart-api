import {
  InvoiceItem,
  InvoiceItemBase,
  LineItems,
  Money,
} from '@feature/shared';

export function flattenRefundableItems(
  items: LineItems<InvoiceItem>,
): LineItems<InvoiceItemBase> {
  const result: LineItems<InvoiceItemBase> = new LineItems(
    (item) => item.productId,
  );

  for (const item of items) {
    if (item.kind === 'leaf') {
      result.set(item);

      continue;
    }

    // Bundle final price after discount
    const bundleTotalWithoutDiscount = item.unitPrice.multiply(item.quantity);
    const discountRatio =
      item.discount === undefined
        ? 1
        : bundleTotalWithoutDiscount
            .subtract(item.discount.totalDiscount)
            .divide(bundleTotalWithoutDiscount.value).value;

    for (const child of item.items) {
      const childTotal = child.unitPrice.multiply(child.quantity);

      result.set({
        ...child,
        discount: {
          discountPerUnit: Money.zero(),
          discountedQuantity: 0,
          totalDiscount: childTotal.subtract(
            childTotal.multiply(discountRatio),
          ),
          source: { id: '' },
        },
        lineTotal: childTotal.multiply(discountRatio),
      });
    }
  }

  return result;
}
