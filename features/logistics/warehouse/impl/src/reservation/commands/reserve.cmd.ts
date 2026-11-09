import { ApiCommand } from '@feature/shared/cqrs';
import {
  ReservationApi,
  ReserveStocksInput,
} from '@feature/warehouse-api/reservation';
import { DrizzleTransactionAls } from '@infra/db-drizzle';
import { StockService } from '../../stock.service';
import { ReservationRepository } from '../reservation.repository';

export class ReserveApiCommand implements ApiCommand<
  ReservationApi,
  'reserve'
> {
  constructor(
    private readonly repository: ReservationRepository,
    private readonly stocks: StockService,
    private readonly tx: DrizzleTransactionAls,
  ) {}
  execute(input: ReserveStocksInput): Promise<{ reservationId: string }> {
    return this.tx.run(async () => {
      await this.stocks.decrease(input.items);

      const { reservationId } = await this.repository.create(input.items);

      return {
        reservationId,
      };
    });
  }
}
