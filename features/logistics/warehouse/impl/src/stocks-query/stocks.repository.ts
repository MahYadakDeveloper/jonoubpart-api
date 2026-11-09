import { DrizzleBaseRepository } from '@infra/db-drizzle';
import { stocks } from '@infra/schema/warehouse/stocks.schema';
import { Injectable } from '@nestjs/common';
import { inArray } from 'drizzle-orm';

@Injectable()
export class StockRepository extends DrizzleBaseRepository {
  findManyById(stockIds: string[]) {
    return this.applyLockConditionally(
      this.db
        .select({
          id: stocks.id,
          quantity: stocks.quantity,
        })
        .from(stocks)
        .where(inArray(stocks.id, stockIds)),
    );
  }
}
