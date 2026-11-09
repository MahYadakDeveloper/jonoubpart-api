export class InsufficientCashbackBalanceError extends Error {
  constructor() {
    super('Insufficient cashback balance to complete this operation.');
    this.name = 'InsufficientCashbackBalanceError';
  }
}

export class CashbackError extends Error {
  constructor(message = 'An error occurred while processing cashback.') {
    super(message);
    this.name = 'CashbackError';
  }
}
