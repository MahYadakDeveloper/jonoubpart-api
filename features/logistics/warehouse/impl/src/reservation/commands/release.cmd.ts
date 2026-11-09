import { ApiCommand } from '@feature/shared/cqrs';
import {
  ReleaseReservationInput,
  ReservationApi,
} from '@feature/warehouse-api/reservation';
import { DrizzleTransactionAls } from '@infra/db-drizzle';
import { StockService } from '../../stock.service';
import { ReservationRepository } from '../reservation.repository';

export class ReleaseApiCommand implements ApiCommand<
  ReservationApi,
  'release'
> {
  constructor(
    private readonly repository: ReservationRepository,
    private readonly stocks: StockService,
    private readonly tx: DrizzleTransactionAls,
  ) {}
  execute(input: ReleaseReservationInput): Promise<void> {
    return this.tx.run(async (lock) => {
      const reservedItems = await lock('update', async () =>
        this.repository.findById(input.reservationId),
      );

      await this.stocks.increase(reservedItems);

      await this.repository.delete(input.reservationId);
    });
  }
}
