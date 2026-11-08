export class ProductNotFoundError extends Error {
  constructor(productId: string) {
    super(`Product '${productId}' was not found or may have not defined yet!`);
    this.name = ProductNotFoundError.name;
  }
}
