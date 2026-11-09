import { assertMaps } from '@feature/shared/utils/assertions';
import {
  InsufficientStockError,
  StockNotFoundError,
} from '@feature/warehouse-api/errors';
import { DrizzleTransactionAls } from '@infra/db-drizzle';
import { Injectable } from '@nestjs/common';
import { StockQuantityChange, StockRepository } from './stocks.repository';

@Injectable()
export class StockService {
  constructor(
    private readonly stocks: StockRepository,
    private readonly tx: DrizzleTransactionAls,
  ) {}

  increase = (items: StockQuantityChange[]) => this.stocks.increase(items);

  async decrease(items: StockQuantityChange[]) {
    return this.tx.run(async (lock) => {
      const requested = items.toMap('stockId', (a, b) => ({
        ...a,
        quantity: a.quantity + b.quantity,
      }));

      const stocks = await lock(
        'update',
        async () => await this.stocks.findManyById([...requested.keys()]),
      );

      assertMaps(
        requested,
        stocks.toMap('id'),
        (r, s) => r.quantity <= s.quantity,
        (key, r, s) => {
          if (!s) return new StockNotFoundError(key);
          return new InsufficientStockError(key, r?.quantity ?? 0, s.quantity);
        },
      );

      await this.stocks.decrease(items);
    });
  }
}
