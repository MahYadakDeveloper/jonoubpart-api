import { InvoiceSnapshot } from '@feature/shared';

export const SaleRecordedEventType = 'sale.sale-recorded';

export interface SaleRecordedEventPayload {
  snapshot: InvoiceSnapshot;
}
