import { CommandOf, InputOf, OutputOf } from '@feature/shared/cqrs';
import { MovementApi } from '@feature/warehouse-api/movement.api';
import { DrizzleTransactionAls } from '@infra/db-drizzle';
import { Injectable } from '@nestjs/common';
import { StockService } from '../../stock.service';
import { MovementRepository } from '../movement.repository';

@Injectable()
export class ReceiptMovementCommand implements CommandOf<
  MovementApi,
  'receipt'
> {
  constructor(
    private readonly repository: MovementRepository,
    private readonly stocks: StockService,
    private readonly tx: DrizzleTransactionAls,
  ) {}

  execute(
    input: InputOf<MovementApi, 'receipt'>,
  ): OutputOf<MovementApi, 'receipt'> {
    return this.tx.run(async () => {
      await this.stocks.increase(input.items);

      const { movementId } = await this.repository.create({
        ...input,
        direction: 'inbound',
      });

      return {
        movementId,
      };
    });
  }
}
