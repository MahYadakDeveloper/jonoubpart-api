export class DuplicateItemsInSaleError extends Error {
  constructor(productId?: string) {
    super(
      productId
        ? `Duplicate item found in sale request for product '${productId}'.`
        : 'Duplicate items found in sale request.',
    );

    this.name = 'DuplicateItemsInSale';
  }
}
