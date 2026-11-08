import { CashbackReversalPolicy } from '@feature/cashback-api';
import { BankDestination } from '@feature/shared';

export type RecordReturnRequest =
  | {
      saleId: string;
      items: {
        productId: string;
        quantity: number;
      }[];
      cashbackReversalPolicy: CashbackReversalPolicy;
      payoff?: { depositTo: BankDestination };
    }
  | {
      saleId: string;
      items: {
        productId: string;
        quantity: number;
      }[];
      cashbackReversalPolicy?: never;
      payoff?: { depositTo: BankDestination };
    };
