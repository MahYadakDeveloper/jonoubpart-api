import {
  InvoiceHeader,
  InvoiceItemBase,
  LineItems,
  Money,
} from '@feature/shared';

export type ReturnSnapshot = {
  header: InvoiceHeader;
  items: LineItems<InvoiceItemBase>;
  summary: ReturnSummary;
  refund: ReturnRefund;
};

export type ReturnSummary = {
  readonly refund: Money;
  readonly payableRefund: Money;
};

export type ReturnRefund = {
  readonly amount: Money;
  readonly cashbackReversed: Money;
};
