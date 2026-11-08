import {
  CategoryDeletedEventPayload,
  CategoryDeletedEventType,
} from '@feature/catalog-category-api';
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
export class CategoryDeletedEventHandler extends BaseEventHandler<CategoryDeletedEventPayload> {
  constructor(
    registry: EventHandlerRegistry,
    private readonly repository: MarkupPolicyRepository,
    private readonly outbox: OutboxRepository,
    private readonly tx: TransactionManager,
  ) {
    super(registry, CategoryDeletedEventType);
  }

  async handle(payload: CategoryDeletedEventPayload): Promise<void> {
    const categoryMarkupPolicy = await this.repository.findByReference({
      scope: 'category',
      referenceId: payload.categoryId,
    });

    if (!categoryMarkupPolicy) return;

    await this.tx.run(async () => {
      await this.repository.delete(categoryMarkupPolicy.id);

      await this.outbox.save({
        type: MarkupPolicyDeletedEventType,
        payload: {
          scope: 'category',
          referenceId: categoryMarkupPolicy.referenceId,
        } satisfies MarkupPolicyEventPayload,
      });
    });
  }
}
