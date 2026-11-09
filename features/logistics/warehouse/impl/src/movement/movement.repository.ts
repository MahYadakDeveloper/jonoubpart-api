import { StrictOmit } from '@feature/shared/types/utils';
import { assertOne } from '@feature/shared/utils/assertions';
import { StockNotFoundError } from '@feature/warehouse-api/errors';
import {
  DuplicateStockError,
  MalformedInputError,
  NonPositiveQuantityError,
  ReferenceSourceMismatchError,
} from '@feature/warehouse-api/movement';
import { DbErrors, DrizzleBaseRepository, onFk, onPk } from '@infra/db-drizzle';
import {
  MOVEMENT_CHECKS,
  movementItems,
  movements,
} from '@infra/schema/warehouse/movements.schema';
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

type CreateMovement = StrictOmit<typeof movements.$inferInsert, 'id'> & {
  items: StrictOmit<typeof movementItems.$inferInsert, 'movementId'>[];
};

@Injectable()
@DbErrors({
  constraints: {
    ...onFk(
      movementItems,
      'stockId',
      ({ stockId }) => new StockNotFoundError(stockId),
    ),
    ...onPk(movementItems, DuplicateStockError),
    [MOVEMENT_CHECKS.itemQuantityPositive]: NonPositiveQuantityError,
    [MOVEMENT_CHECKS.referenceMatchesSource]: ReferenceSourceMismatchError,
  },
  kinds: { invalidInput: MalformedInputError },
})
export class MovementRepository extends DrizzleBaseRepository {
  async findById(id: string) {
    return this.applyLockConditionally(
      this.db
        .select()
        .from(movements)
        .where(eq(movements.id, id))
        .leftJoin(movementItems, eq(movementItems.movementId, movements.id)),
      movements,
    ).then((rows) => {
      assertOne(rows, Error);
      const { movements: m } = rows[0];
      return {
        ...m,
        items: rows.flatMap((r) =>
          r.movement_items ? [r.movement_items] : [],
        ),
      };
    });
  }

  async create(movement: CreateMovement) {
    return this.transaction(async () => {
      const [inserted] = await this.db
        .insert(movements)
        .values(movement)
        .returning({ id: movements.id });

      await this.db
        .insert(movementItems)
        .values(
          movement.items.map((i) => ({ movementId: inserted!.id, ...i })),
        );

      return {
        movementId: inserted!.id,
      };
    });
  }

  async delete(movementId: string) {
    await this.db.delete(movements).where(eq(movements.id, movementId));
  }
}
