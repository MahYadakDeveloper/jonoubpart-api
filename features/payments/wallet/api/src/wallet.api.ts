interface WalletCommandInput {
  readonly customerId: string;

  readonly idempotencyKey: string;
  readonly note?: string;
}

export interface WalletCreditInput extends WalletCommandInput {
  readonly amount: number;
  readonly reason: 'cashback' | 'manual_adjustment';
}

export interface WalletDebitInput extends WalletCommandInput {
  readonly amount: number;
  readonly reason:
    | 'order_payment'
    | 'payout'
    | 'cashback_reversal'
    | 'manual_adjustment';
}

export interface WalletFreezeInput extends WalletCommandInput {
  readonly amount: number;
  readonly reason: 'payout_request' | 'manual';
}

export interface WalletCommitFreezeInput extends WalletCommandInput {
  readonly freezeId: string;
}

export interface WalletReleaseFreezeInput extends WalletCommandInput {
  readonly freezeId: string;
}

export interface GetWalletBalanceInput {
  readonly customerId: string;
}

export interface WalletBalanceResult {
  total: number;
  frozen: number;
  available: number;
}

export interface WalletTransactionResult {
  transactionId: string;
}

export interface WalletFreezeResult {
  freezeId: string;
}

export const WALLET_API = Symbol('WALLET_API');

export interface WalletApi {
  getBalance(input: GetWalletBalanceInput): Promise<WalletBalanceResult>;

  credit(input: WalletCreditInput): Promise<WalletTransactionResult>;
  debit(input: WalletDebitInput): Promise<WalletTransactionResult>;

  freeze(input: WalletFreezeInput): Promise<WalletFreezeResult>;
  commitFreeze(
    input: WalletCommitFreezeInput,
  ): Promise<WalletTransactionResult>;
  releaseFreeze(input: WalletReleaseFreezeInput): Promise<WalletFreezeResult>;
}
