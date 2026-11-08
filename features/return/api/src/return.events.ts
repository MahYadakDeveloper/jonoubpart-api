import { ReturnSnapshot } from './return.types';

export const SaleReturnRecordedEventType = 'sale.sale-recorded';

export type SaleReturnRecordedEventPayload = { snapshot: ReturnSnapshot };
