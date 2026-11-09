import { InvoiceSnapshot } from '@feature/shared';
import { Sale } from './model/sale';

export interface SaleRepository {
  recordSale(snapshot: Required<InvoiceSnapshot>): Promise<{ saleId: string }>;
  findById(saleId: string): Promise<Sale>;
}
