export class DiscountCustomerUsageLimitExceededError extends Error {
  readonly name = 'DiscountCustomerUsageLimitExceededError';

  constructor(readonly discountId: string) {
    super(`Customer usage limit exceeded for discount "${discountId}".`);

    Object.setPrototypeOf(
      this,
      DiscountCustomerUsageLimitExceededError.prototype,
    );
  }
}
