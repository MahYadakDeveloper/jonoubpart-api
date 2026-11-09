import {
  ProductRedefinedEventPayload,
  ProductRedefinedEventType,
} from '@feature/catalog-api';
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
import { Injectable } from '@nestjs/common';
import { type CatalogRepository } from 'repository/catalog.repository';

@Injectable()
export class CategoryDeletedEventHandler extends BaseEventHandler<CategoryDeletedEventPayload> {
  constructor(
    registry: EventHandlerRegistry,
    private readonly repository: CatalogRepository,
    private readonly tx: TransactionManager,
    private readonly outbox: OutboxRepository,
  ) {
    super(registry, CategoryDeletedEventType);
  }

  async handle(payload: CategoryDeletedEventPayload): Promise<void> {
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

    await this.tx.run(async () => {
      for (const product of products) {
        this.repository.update(product.id, {
          ...product,
          references: {
            ...product.references,
            categoryIds: product.references.categoryIds.filter(
              (categoryId) => payload.categoryId === categoryId,
            ),
          },
        });
      }

      await this.outbox.saveMany(
        products.map((product) => ({
          type: ProductRedefinedEventType,
          payload: {
            productId: product.id,
          } satisfies ProductRedefinedEventPayload,
        })),
      );
    });
  }
}
