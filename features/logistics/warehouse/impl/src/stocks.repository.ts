import { sqlCase } from '@feature/shared/utils/common';
import { InsufficientStockError } from '@feature/warehouse-api/errors';
import { DbErrors, DrizzleBaseRepository } from '@infra/db-drizzle';
import {
  STOCK_CONSTRAINTS,
  stocks,
} from '@infra/schema/warehouse/stocks.schema';
import { eq, inArray, sql } from 'drizzle-orm';

export type StockQuantityChange = {
  stockId: string;
  quantity: number;
};

@DbErrors({
  constraints: {
    [STOCK_CONSTRAINTS.quantityNonNegative]: InsufficientStockError,
  },
})
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

  async increase(items: StockQuantityChange[]): Promise<void> {
    await this.db
      .update(stocks)
      .set({
        quantity: sql`
          ${stocks.quantity} + ${sqlCase<number>(
            items.map((i) => ({
              when: eq(stocks.id, i.stockId),
              then: sql`${i.quantity}`,
            })),
            sql`0`,
          )}
        `,
      })
      .where(
        inArray(
          stocks.id,
          items.map(({ stockId }) => stockId),
        ),
      );
  }

  async decrease(items: StockQuantityChange[]): Promise<void> {
    await this.db
      .update(stocks)
      .set({
        quantity: sql`

          ${stocks.quantity} - ${sqlCase<number>(
            items.map((i) => ({
              when: eq(stocks.id, i.stockId),
              then: sql`${i.quantity}`,
            })),
            sql`0`,
          )}
        `,
      })
      .where(
        inArray(
          stocks.id,
          items.map(({ stockId }) => stockId),
        ),
      );
  }
}
