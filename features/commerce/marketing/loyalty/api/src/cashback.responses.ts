import { GrantedCashback, Money } from '@feature/shared';

export type ReversalCashbackResponse =
  | {
      kind: 'reversed';
      reversedAmount: Money;
    }
  | {
      kind: 'deduct_from_refund';
      deductedAmount: Money;
    };

export interface GrantingCashbackResponse {
  grantedCashback: GrantedCashback;
}

export interface CalculateCashbackResponse {
  cashback: GrantedCashback;
}
