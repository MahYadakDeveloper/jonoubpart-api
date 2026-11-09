export class ProductNotFoundError extends Error {
  constructor(productId: string) {
    super(`Product '${productId}' was not found.`);
    this.name = ProductNotFoundError.name;
  }
}
