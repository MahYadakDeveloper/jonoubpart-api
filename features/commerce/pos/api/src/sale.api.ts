import { FindSaleRequest } from './sale.req';
import { FindSaleResponse } from './sale.res';

export interface SaleApi {
  find(req: FindSaleRequest): Promise<FindSaleResponse>;
}
