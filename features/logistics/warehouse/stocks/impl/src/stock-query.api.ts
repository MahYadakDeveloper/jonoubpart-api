import { Barcode } from '@feature/shared/types/barcode';
import { ensureFound, ensureLength } from '@feature/shared/utils/assertions';
import { Stock, StockQueryApi } from '@feature/warehouse-api/stock-query.api';
import { NotFoundException } from '@nestjs/common';
import { StockRepository } from './stock.repository';

export class StockQueryApiImpl implements StockQueryApi {
  constructor(private readonly stocks: StockRepository) {}
  getById({ stockId }: { stockId: string }): Promise<Stock> {
    return this.stocks
      .findById(stockId)
      .then((s) =>
        ensureFound(s, () => new NotFoundException('Stock not found')),
      );
  }

  getManyById({ stockIds }: { stockIds: string[] }): Promise<Stock[]> {
    return this.stocks
      .findManyById(stockIds)
      .then((s) => [
        ...ensureLength(
          s,
          stockIds.length,
          () => new NotFoundException('There are some stocking missing'),
        ),
      ]);
  }

  getByBarcode({ barcode }: { barcode: Barcode }): Promise<Stock> {
    return this.stocks
      .findByBarcode(barcode)
      .then((s) =>
        ensureFound(s, () => new NotFoundException('Stock not found')),
      );
  }

  available(input: {
    stockIds: string[];
  }): Promise<{ stockId: string; available: boolean }[]> {
    return this.stocks
      .available(input.stockIds)
      .then((a) => a.map((i) => ({ stockId: i.id, available: i.available })));
  }
}
