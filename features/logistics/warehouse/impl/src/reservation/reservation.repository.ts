import { StrictOmit } from '@feature/shared/types/utils';
import {
  DuplicateStockError,
  MalformedInputError,
  NonPositiveQuantityError,
} from '@feature/warehouse-api/reservation';
import { DbErrors, DrizzleBaseRepository, onFk, onPk } from '@infra/db-drizzle';
import {
  reservationItems,
  reservations,
  RESERVATIONS_CHECKS,
} from '@infra/schema/warehouse/reservations.schema';
import { eq } from 'drizzle-orm';

type ReserveItem = StrictOmit<
  typeof reservationItems.$inferInsert,
  'reservationId'
>;

@DbErrors({
  constraints: {
    ...onFk(
      reservationItems,
      'stockId',
      ({ stockId }) => new StockNotFoundError(stockId),
    ),
    ...onPk(reservationItems, DuplicateStockError),
    [RESERVATIONS_CHECKS.reservationItemsQtyPositive]: NonPositiveQuantityError,
  },
  kinds: { invalidInput: MalformedInputError },
})
export class ReservationRepository extends DrizzleBaseRepository {
  async findById(reservationId: string) {
    return this.applyLockConditionally(
      this.db
        .select()
        .from(reservationItems)
        .where(eq(reservationItems.reservationId, reservationId)),
    );
  }

  async create(items: ReserveItem[]) {
    const [inserted] = await this.db
      .insert(reservations)
      .values({})
      .returning({ id: reservations.id });

    await this.db
      .insert(reservationItems)
      .values(items.map((s) => ({ ...s, reservationId: inserted!.id })));

    return {
      reservationId: inserted!.id,
    };
  }

  async delete(reservationId: string): Promise<void> {
    await this.db
      .delete(reservations)
      .where(eq(reservations.id, reservationId));
  }
}
