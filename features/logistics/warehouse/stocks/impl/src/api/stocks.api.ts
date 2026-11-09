import { ensureFound } from '@feature/shared/utils/assertions';
import {
  AvailableInput,
  AvailableResult,
  GetByBarcodeInput,
  GetByIdInput,
  GetManyByIdInput,
  Stock,
  StockQueryApi,
} from '@feature/warehouse-api';
import { NotFoundException } from '@nestjs/common';
import { StockRepository } from '../stock.repository';

export class StockApiImpl implements StockQueryApi {
  constructor(private readonly repository: StockRepository) {}
  getById({ stockId }: GetByIdInput): Promise<Stock> {
    return this.repository
      .findById(stockId)
      .then((s) =>
        ensureFound(s, () => new NotFoundException('Stock not found')),
      );
  }
  getManyById(input: GetManyByIdInput): Promise<Stock[]> {
    throw new Error('Method not implemented.');
  }
  getByBarcode(input: GetByBarcodeInput): Promise<Stock> {
    throw new Error('Method not implemented.');
  }
  available(input: AvailableInput): Promise<AvailableResult> {
    throw new Error('Method not implemented.');
  }
}
