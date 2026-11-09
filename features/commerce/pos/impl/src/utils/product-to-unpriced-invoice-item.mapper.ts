import { ProductDto } from '@feature/catalog-api';
import { UnpricedInvoiceItem } from '@feature/pricing-api';

export function mapProductToUnpricedInvoiceItem(
  product: ProductDto,
  quantity = 1,
): UnpricedInvoiceItem {
  if (product.kind === 'leaf') {
    return {
      kind: 'leaf',
      productId: product.id,
      description: product.displayName,
      quantity,
    };
  }

  return {
    kind: 'bundle',
    productId: product.id,
    description: product.displayName,
    quantity,
    items: product.items.toArray().map((bundleItem) => ({
      kind: 'leaf',
      productId: bundleItem.productId,
      description: bundleItem.displayName,
      quantity: bundleItem.quantity,
    })),
  };
}
