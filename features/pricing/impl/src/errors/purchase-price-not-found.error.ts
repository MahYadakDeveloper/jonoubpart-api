export class PurchasePriceNotFoundError extends Error {
  constructor(productId: string) {
    super(`Purchase price for product '${productId}' was not found.`);
    this.name = PurchasePriceNotFoundError.name;
  }
}
