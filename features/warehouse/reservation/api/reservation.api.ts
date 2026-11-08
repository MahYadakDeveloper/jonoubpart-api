import { StrictOmit } from '@feature/shared/types/utils';
import { reservationItems } from '@infra/schema/warehouse/reservations.schema';

interface StockReservationItem extends StrictOmit<
  typeof reservationItems.$inferInsert,
  'reservationId'
> {}

export interface ReserveStocksInput {
  items: StockReservationItem[];
}

export interface ReleaseReservationInput {
  reservationId: string;
}

export const RESERVATION_API = Symbol('WAREHOUSE_RESERVATION_API');

export interface ReservationApi {
  /**
   * Reserves stock. `movementSource` is stored and used by `consume`.
   *
   * @throws {NonPositiveQuantityError}
   */
  reserve(input: ReserveStocksInput): Promise<{ reservationId: string }>;

  /** Cancels an active reservation. No-op if released; fails if consumed. */
  release(input: ReleaseReservationInput): Promise<void>;
}
