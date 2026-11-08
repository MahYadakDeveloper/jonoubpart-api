import {
  InvoiceHeader,
  InvoiceItem,
  InvoicePayment,
  InvoiceSummary,
  LineItems,
} from '@feature/shared';

export type Sale = {
  id: string;
  invoiceNumber: string;
  header: InvoiceHeader;
  items: LineItems<InvoiceItem>;
  summary: InvoiceSummary;
  payment: InvoicePayment;
};
