import { CommandOf, InputOf, OutputOf } from '@feature/shared/cqrs';
import { assertFound, assertNever } from '@feature/shared/utils/assertions';
import { MovementApi } from '@feature/warehouse-api/movement.api';
import { DrizzleTransactionAls } from '@infra/db-drizzle';
import { Injectable } from '@nestjs/common';
import { StockService } from '../../stock.service';
import { MovementRepository } from '../movement.repository';
import {
  MovementNotFoundError,
  MovementNotUndoableError,
} from '@feature/warehouse-errors/movement.errors';

@Injectable()
export class UndoMovementCommand implements CommandOf<MovementApi, 'undo'> {
  constructor(
    private readonly repository: MovementRepository,
    private readonly stocks: StockService,
    private readonly tx: DrizzleTransactionAls,
  ) {}

  async execute(
    input: InputOf<MovementApi, 'undo'>,
  ): OutputOf<MovementApi, 'undo'> {
    return this.tx.run(async () => {
      const movement = await this.repository.findById(input.movementId);

      assertUndoable(movement);

      switch (movement.direction) {
        case 'inbound': {
          await this.stocks.decrease(movement.items);
          break;
        }
        case 'outbound': {
          await this.stocks.increase(movement.items);
          break;
        }
        default:
          assertNever(movement.direction);
      }

      await this.repository.delete(movement.id);
    });
  }
}

function assertUndoable<
  T extends Awaited<ReturnType<MovementRepository['findById']>>,
>(movement?: T | null): asserts movement is T {
  assertFound(movement, MovementNotFoundError);

  if (
    movement.direction === 'inbound' &&
    (movement.source === 'order' || movement.source === 'sale')
  )
    throw new MovementNotUndoableError(movement.id, movement.source);
}
