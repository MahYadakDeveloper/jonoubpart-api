import {
  ProductRedefinedEventPayload,
  ProductRedefinedEventType,
} from '@feature/catalog-api';
import {
  CategoryUpdatedEventPayload,
  CategoryUpdatedEventType,
} from '@feature/catalog-category-api';
import {
  BaseEventHandler,
  type EventHandlerRegistry,
  type OutboxRepository,
} from '@feature/shared';
import { Injectable } from '@nestjs/common';
import { type CatalogRepository } from 'repository/catalog.repository';

@Injectable()
export class CategoryUpdatedEventHandler extends BaseEventHandler<CategoryUpdatedEventPayload> {
  constructor(
    registry: EventHandlerRegistry,
    private readonly repository: CatalogRepository,
    private readonly outbox: OutboxRepository,
  ) {
    super(registry, CategoryUpdatedEventType);
  }

  async handle(payload: CategoryUpdatedEventPayload): Promise<void> {
    const products = await this.repository
      .findMany({
        where: {
          references: {
            categoryIds: {
              has: payload.categoryId,
            },
          },
        },
      })
      .then((res) => res.toArray());

    if (products.length === 0) return;

    await this.outbox.saveMany(
      products.map((product) => ({
        type: ProductRedefinedEventType,
        payload: {
          productId: product.id,
        } satisfies ProductRedefinedEventPayload,
      })),
    );
  }
}
