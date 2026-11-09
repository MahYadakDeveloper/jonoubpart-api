import { type CommandOf, CommandsOf } from '@feature/shared/cqrs';
import { MovementApi } from '@feature/warehouse-api/movement.api';
import { Inject, Injectable } from '@nestjs/common';
import { IssueMovementCommand } from './issue.cmd';
import { ReceiptMovementCommand } from './receipt.cmd';
import { ReturnMovementCommand } from './return.cmd';
import { UndoMovementCommand } from './undo.cmd';

@Injectable()
export class MovementCommands implements CommandsOf<MovementApi> {
  @Inject(IssueMovementCommand)
  readonly issue: CommandOf<MovementApi, 'issue'>;
  @Inject(ReceiptMovementCommand)
  readonly receipt: CommandOf<MovementApi, 'receipt'>;
  @Inject(ReturnMovementCommand)
  readonly return: CommandOf<MovementApi, 'return'>;
  @Inject(UndoMovementCommand)
  readonly undo: CommandOf<MovementApi, 'undo'>;
}
