import {
  FitmentNodeUpdatedEventPayload,
  FitmentNodeUpdatedEventType,
} from '@feature/catalog.fitment.node-api';
import {
  BaseEventHandler,
  EventHandlerRegistry,
  OutboxRepository,
  TransactionManager,
} from '@feature/shared';
import {
  FitmentManyUpdatedEventPayload,
  FitmentManyUpdatedEventType,
} from '@feature/fitment-api';
import { FitmentRepository } from '../repository/fitment.repository';

export class FitmentNodeUpdatedEventHandler extends BaseEventHandler<FitmentNodeUpdatedEventPayload> {
  constructor(
    registry: EventHandlerRegistry,
    private readonly repository: FitmentRepository,
    private readonly tx: TransactionManager,
    private readonly outbox: OutboxRepository,
  ) {
    super(registry, FitmentNodeUpdatedEventType);
  }

  async handle(payload: FitmentNodeUpdatedEventPayload): Promise<void> {
    const fitments = await this.repository.findManyByReferredFitment([
      ...payload.fitmentNodeId,
    ]);

    await this.tx.run(async () => {
      await this.repository.deleteMany([...fitments.keys()]);

      await this.outbox.save({
        type: FitmentManyUpdatedEventType,
        payload: {
          fitmentsIds: [...fitments.keys()],
        } satisfies FitmentManyUpdatedEventPayload,
      });
    });
  }
}
