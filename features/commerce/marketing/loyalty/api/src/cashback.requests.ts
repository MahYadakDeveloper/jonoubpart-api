import {
  GrantedCashback,
  InvoiceItem,
  InvoiceItemBase,
  LineItems,
} from '@feature/shared';
import { CashbackReversalPolicy } from './cashback.enums';

export interface ReversalCashbackRequest {
  customerId: string;
  refundedItems: LineItems<InvoiceItemBase>;
  referenceId: string;
  granted: GrantedCashback;
  policy: CashbackReversalPolicy;
}

export interface GrantingCashbackRequest {
  customerId: string;
  referenceId: string;
  purchasedItems: LineItems<InvoiceItem>;
  expectedCashback: GrantedCashback;
}

export interface CalculateCashbackRequest {
  customerId: string;
  purchasedItems: LineItems<InvoiceItem>;
}
