import { Command } from '@feature/shared/cqrs';
import { assertNever, assertOne } from '@feature/shared/utils/assertions';
import { StockNotFoundError } from '@feature/warehouse-errors/stocks.error';
import { type Database, InjectDrizzle } from '@infra/db-drizzle';
import {
  adjustmentEffect,
  adjustments,
} from '@infra/schema/warehouse/adjustments.schema';
import {
  movementDirection,
  movements,
} from '@infra/schema/warehouse/movements.schema';
import { stocks } from '@infra/schema/warehouse/stocks.schema';
import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

type AdjustInput = typeof adjustments.$inferInsert;

@Injectable()
export class AdjustCommand implements Command<AdjustInput, void> {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  execute(input: AdjustInput): Promise<void> {
    return this.db.transaction(async (tx) => {
      const { effect } = input;
      let op;
      switch (effect) {
        case 'surplus':
          op = '+';
          break;
        case 'shortage':
          op = '-';
          break;
        default:
          assertNever(effect);
      }

      const updated = await tx
        .update(stocks)
        .set({
          quantity: sql`${stocks.quantity} ${sql.raw(op)} ${input.quantity}`,
        })
        .where(eq(stocks.id, input.stockId))
        .returning({ id: stocks.id });

      assertOne(updated, StockNotFoundError);

      const [inserted] = await tx
        .insert(adjustments)
        .values(input)
        .returning({ id: adjustments.id });

      const DIRECTION_BY_EFFECT = {
        surplus: 'inbound',
        shortage: 'outbound',
      } as const satisfies Record<
        (typeof adjustmentEffect.enumValues)[number],
        (typeof movementDirection.enumValues)[number]
      >;

      await tx.insert(movements).values({
        direction: DIRECTION_BY_EFFECT[effect],
        source: 'adjustment',
        adjustmentId: inserted!.id,
      });
    });
  }
}
