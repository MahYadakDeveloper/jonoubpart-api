import { GrantedCashback } from '@feature/shared';

export abstract class CashbackError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class CashbackAmountChangedError extends CashbackError {
  readonly code = 'CASHBACK_AMOUNT_CHANGED';

  constructor({
    expected,
    actual,
  }: {
    expected: GrantedCashback;
    actual: GrantedCashback;
  }) {
    super(
      `Cashback amount changed. Expected ${expected.amount.value} with rate ${expected.appliedRate}, but got ${actual.amount.value} with rate ${actual.appliedRate}`,
    );
  }
}

export class InvalidCashbackRateError extends CashbackError {
  readonly code = 'INVALID_CASHBACK_RATE';

  constructor(public readonly rate: number) {
    super(`Invalid cashback rate: ${rate}. Rate must be between 0 and 1.`);
  }
}
