import {
  BrandDeletedEventPayload,
  BrandDeletedEventType,
} from '@feature/catalog-brand-api';
import {
  BaseEventHandler,
  type EventHandlerRegistry,
  type OutboxRepository,
  type TransactionManager,
} from '@feature/shared';
import {
  MarkupPolicyDeletedEventType,
  MarkupPolicyEventPayload,
} from '@feature/pricing-markup-api';
import { Injectable } from '@nestjs/common';
import { type MarkupPolicyRepository } from '../markup.repository';

@Injectable()
export class BrandDeletedEventHandler extends BaseEventHandler<BrandDeletedEventPayload> {
  constructor(
    registry: EventHandlerRegistry,
    private readonly repository: MarkupPolicyRepository,
    private readonly outbox: OutboxRepository,
    private readonly tx: TransactionManager,
  ) {
    super(registry, BrandDeletedEventType);
  }

  async handle(payload: BrandDeletedEventPayload): Promise<void> {
    const brandMarkupPolicy = await this.repository.findByReference({
      scope: 'brand',
      referenceId: payload.brandId,
    });

    if (!brandMarkupPolicy) return;

    await this.tx.run(async () => {
      await this.repository.delete(brandMarkupPolicy.id);

      await this.outbox.save({
        type: MarkupPolicyDeletedEventType,
        payload: {
          scope: 'brand',
          referenceId: brandMarkupPolicy.referenceId,
        } satisfies MarkupPolicyEventPayload,
      });
    });
  }
}
