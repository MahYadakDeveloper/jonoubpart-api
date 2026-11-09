import {
  AvailableInput,
  AvailableResult,
  GetByBarcodeInput,
  GetByIdInput,
  GetManyByIdInput,
  Stock,
  StockQueryApi,
} from '@feature/warehouse-api/stock-query';
import { StockRepository } from './stocks.repository';

export class StockQueryApiImpl implements StockQueryApi {
  constructor (private readonly repository: StockRepository) {}
  getById(input: GetByIdInput): Promise<Stock> {
  }
  getManyById(input: GetManyByIdInput): Promise<Stock[]> {
    return this.repository.findManyById(input.stockIds).then({stocks =>})
  }
  getByBarcode(input: GetByBarcodeInput): Promise<Stock> {
    throw new Error('Method not implemented.');
  }
  available(input: AvailableInput): Promise<AvailableResult> {
    throw new Error('Method not implemented.');
  }
}
