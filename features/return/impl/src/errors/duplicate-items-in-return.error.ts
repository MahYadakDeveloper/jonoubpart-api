export class DuplicateItemsInReturnError extends Error {
  constructor(productId?: string) {
    super(
      productId
        ? `Duplicate item found in return request for product '${productId}'.`
        : 'Duplicate items found in return request.',
    );

    this.name = 'DuplicateItemsInReturn';
  }
}
