import {
  OffsetPagination,
  orderBy,
  PageCriteria,
  PageResult,
} from '@feature/shared/pagination';
import { StrictOmit } from '@feature/shared/types/utils';
import {
  assertFirst,
  assertLength,
  assertSamePayload,
  assertString,
  ensureOne,
} from '@feature/shared/utils/assertions';
import { unordered } from '@feature/shared/utils/canonical';
import { groupMap } from '@feature/shared/utils/collections';
import { sqlCase } from '@feature/shared/utils/common';
import { movementItems, movements, stocks } from '@feature/warehouse-schema';
import { DrizzleBaseRepository } from '@infra/db-drizzle';
import { InternalServerErrorException } from '@nestjs/common';
import { count, eq, getColumns, inArray, sql } from 'drizzle-orm';

type MovementRow = {
  movements: typeof movements.$inferSelect;
  movement_items: typeof movementItems.$inferSelect | null;
};
type Movement = StrictOmit<typeof movements.$inferInsert, 'id' | 'movedAt'>;
type MovementItem = StrictOmit<typeof movementItems.$inferInsert, 'movementId'>;

export type MovementRecord = StrictOmit<
  typeof movements.$inferSelect,
  'idempotencyKey'
> & {
  items: MovementItem[];
};

export interface RecordMovement extends Movement {
  items: MovementItem[];
}

export interface MovementResult {
  movementId: string;
  created: boolean;
}

export class MovementRepository extends DrizzleBaseRepository {
  async page({
    page,
    size,
    sort,
  }: PageCriteria<typeof movements>): Promise<
    PageResult<MovementRecord, OffsetPagination>
  > {
    const offset = (page - 1) * size;

    const paginatedMovements = this.db
      .select()
      .from(movements)
      .orderBy(...orderBy(movements, sort))
      .offset(offset)
      .limit(size)
      .as('paginated_movement');

    const [movementRows, totalItemsRows] = await Promise.all([
      this.db
        .select({
          movements: getColumns(paginatedMovements),
          movement_items: movementItems,
        })
        .from(paginatedMovements)
        .leftJoin(
          movementItems,
          eq(movementItems.movementId, paginatedMovements.id),
        ),
      this.db
        .select({
          totalItems: count(),
        })
        .from(movements),
    ]);

    const totalItems =
      movementRows.length > 0
        ? ensureOne(
            totalItemsRows,
            () =>
              new InternalServerErrorException(
                'Count record is 0 while some records is found',
              ),
          ).totalItems
        : 0;

    const totalPages = Math.ceil(totalItems / size);

    return {
      page: {
        items: groupMap(movementRows, (m) => m.movements.id, toMovementRecord),
        number: page,
        size,
        totalItems,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  record(movement: RecordMovement): Promise<MovementResult> {
    return this.transaction<MovementResult>(async (tx) => {
      const [inserted] = await tx
        .insert(movements)
        .values(movement)
        .onConflictDoNothing({ target: movements.idempotencyKey })
        .returning({ id: movements.id });

      if (!inserted) {
        assertString(movement.idempotencyKey, () => new CreationFailureError());

        const rows = await tx
          .select()
          .from(movements)
          .leftJoin(movementItems, eq(movementItems.movementId, movements.id))
          .where(eq(movements.idempotencyKey, movement.idempotencyKey));

        assertFirst(rows, () => new CreationFailureError());

        const existing = toMovementRecord(rows);

        assertSamePayload(
          movement,
          existing,
          () => new IdempotencyConflictError(),
          ({ direction, source, items }) => ({
            direction,
            source,
            items: unordered(
              items.map(({ stockId, quantity }) => ({ stockId, quantity })),
            ),
          }),
        );

        return {
          movementId: existing.id,
          created: false,
        };
      }

      const insertedItems = await tx
        .insert(movementItems)
        .values(movement.items.map((i) => ({ movementId: inserted.id, ...i })))
        .returning({ id: movementItems.stockId });

      assertLength(
        insertedItems,
        movement.items.length,
        () => new CreationFailureError(),
      );

      return {
        movementId: inserted.id,
        created: true,
      };
    });
  }

  async increase(
    items: { stockId: string; quantity: number }[],
  ): Promise<void> {
    await this.db
      .update(stocks)
      .set({
        quantity: sql`${stocks.quantity} + ${sqlCase<number>(
          items.map((i) => ({
            when: eq(stocks.id, i.stockId),
            then: sql`${i.quantity}`,
          })),
          sql`0`,
        )}`,
      })
      .where(
        inArray(
          stocks.id,
          items.map(({ stockId }) => stockId),
        ),
      );
  }

  async decrease(
    items: { stockId: string; quantity: number }[],
  ): Promise<void> {
    await this.db
      .update(stocks)
      .set({
        quantity: sql`${stocks.quantity} - ${sqlCase<number>(
          items.map((i) => ({
            when: eq(stocks.id, i.stockId),
            then: sql`${i.quantity}`,
          })),
          sql`0`,
        )}`,
      })
      .where(
        inArray(
          stocks.id,
          items.map(({ stockId }) => stockId),
        ),
      );
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(movements).where(eq(movements.id, id));
  }
}

function toMovementRecord(rows: readonly MovementRow[]): MovementRecord {
  assertFirst(rows, () => new MovementNotFoundError());

  return {
    ...rows[0].movements,
    items: rows.flatMap(({ movement_items: item }) =>
      item ? [{ stockId: item.stockId, quantity: item.quantity }] : [],
    ),
  };
}

export class CreationFailureError extends Error {}
export class MovementNotFoundError extends Error {}
export class IdempotencyConflictError extends Error {}
