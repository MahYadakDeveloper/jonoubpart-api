export class DiscountTotalUsageLimitExceededError extends Error {
  readonly name = 'DiscountTotalUsageLimitExceededError';

  constructor(readonly discountId: string) {
    super(`Total usage limit exceeded for discount "${discountId}".`);

    Object.setPrototypeOf(this, DiscountTotalUsageLimitExceededError.prototype);
  }
}
