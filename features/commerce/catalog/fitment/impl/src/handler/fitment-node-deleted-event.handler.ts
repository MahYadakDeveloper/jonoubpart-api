import {
  FitmentNodeDeletedEventPayload,
  FitmentNodeDeletedEventType,
} from '@feature/catalog.fitment.node-api';
import {
  BaseEventHandler,
  EventHandlerRegistry,
  OutboxRepository,
  TransactionManager,
} from '@feature/shared';
import {
  FitmentManyDeletedEventPayload,
  FitmentManyDeletedEventType,
} from '@feature/fitment-api';
import { FitmentRepository } from '../repository/fitment.repository';

export class FitmentNodeDeletedEventHandler extends BaseEventHandler<FitmentNodeDeletedEventPayload> {
  constructor(
    registry: EventHandlerRegistry,
    private readonly repository: FitmentRepository,
    private readonly tx: TransactionManager,
    private readonly outbox: OutboxRepository,
  ) {
    super(registry, FitmentNodeDeletedEventType);
  }

  async handle(payload: FitmentNodeDeletedEventPayload): Promise<void> {
    const fitments = await this.repository.findManyByReferredFitment([
      ...payload.fitmentNodes.keys(),
    ]);

    await this.tx.run(async () => {
      await this.repository.deleteMany([...fitments.keys()]);

      await this.outbox.save({
        type: FitmentManyDeletedEventType,
        payload: {
          fitmentsIds: [...fitments.keys()],
        } satisfies FitmentManyDeletedEventPayload,
      });
    });
  }
}
