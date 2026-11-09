import { CommandOf, InputOf, OutputOf } from '@feature/shared/cqrs';
import '@feature/shared/extensions';
import { MovementApi } from '@feature/warehouse-api/movement.api';
import { DrizzleTransactionAls } from '@infra/db-drizzle';
import { Injectable } from '@nestjs/common';
import { QuarantineRepository } from '../../quarantine.repository';
import { StockService } from '../../stock.service';
import { MovementRepository } from '../movement.repository';

@Injectable()
export class ReturnMovementCommand implements CommandOf<MovementApi, 'return'> {
  constructor(
    private readonly repository: MovementRepository,
    private readonly quarantines: QuarantineRepository,
    private readonly stocks: StockService,
    private readonly tx: DrizzleTransactionAls,
  ) {}

  async execute(
    input: InputOf<MovementApi, 'return'>,
  ): OutputOf<MovementApi, 'return'> {
    return this.tx.run(async () => {
      const { true: quarantineStocksInput = [], false: restockInput = [] } =
        Object.groupBy(input.items, (s) => String(s.quarantine)) as {
          true?: Extract<(typeof input.items)[number], { quarantine: true }>[];
          false?: Extract<
            (typeof input.items)[number],
            { quarantine: false }
          >[];
        };

      const restock = [
        ...restockInput
          .map(({ quarantine: _q, ...s }) => ({ ...s, quantity: 0 }))
          .toMap('stockId', (a, b) => ({
            ...a,
            quantity: a.quantity + b.quantity,
          }))
          .values(),
      ];

      await this.stocks.increase(restock);

      const { items: _items, ...m } = input;
      const { movementId } = await this.repository.create({
        ...m,
        items: restock,
        direction: 'inbound',
      });

      const quarantineStocks = quarantineStocksInput.map(
        ({ quarantine: _quarantine, ...q }) => ({ ...q, movementId }),
      );
      await this.quarantines.quarantine(quarantineStocks);

      return { movementId };
    });
  }
}
