import {
  ProductRedefinedEventPayload,
  ProductRedefinedEventType,
} from '@feature/catalog-api';
import {
  BrandDeletedEventPayload,
  BrandDeletedEventType,
} from '@feature/catalog-brand-api';
import { type FitmentApi } from '@feature/catalog-fitment-api';
import {
  BaseEventHandler,
  type EventHandlerRegistry,
  type OutboxRepository,
  type TransactionManager,
} from '@feature/shared';
import { Injectable } from '@nestjs/common';
import { type CatalogRepository } from 'repository/catalog.repository';
import { generateSearchText } from 'utils/generate-search-text';

@Injectable()
export class BrandDeletedEventHandler extends BaseEventHandler<BrandDeletedEventPayload> {
  constructor(
    registry: EventHandlerRegistry,
    private readonly repository: CatalogRepository,
    private readonly fitment: FitmentApi,
    private readonly tx: TransactionManager,
    private readonly outbox: OutboxRepository,
  ) {
    super(registry, BrandDeletedEventType);
  }

  async handle(payload: BrandDeletedEventPayload): Promise<void> {
    const products = await this.repository.findMany({
      where: {
        references: {
          brandId: {
            equals: payload.brandId,
          },
        },
      },
    });

    if (products.size === 0) return;

    await this.tx.run(async () => {
      // Resolving fitments
      const productFitments = products.transform(
        (product) => ({
          productId: product.id,
          fitmentIds: product.references.fitmentIds,
        }),
        (x) => x.productId,
      );
      const fitmentIds = [
        ...new Set(productFitments.toArray().flatMap((x) => x.fitmentIds)),
      ];
      const { fitments } = await this.fitment.findMany({ fitmentIds });
      for (const product of products) {
        await this.repository.update(product.id, {
          ...product,
          references: {
            ...product.references,
            brandId: undefined,
          },
          searchText: generateSearchText({
            canonicalName: product.canonicalName,
            aliases: product.aliases,
            fitments: productFitments
              .getOrThrow(product.id)
              .fitmentIds.map((fitmentId) => fitments.getOrThrow(fitmentId))
              .toLineItems((fitment) => fitment.id),
            brand: undefined,
          }),
        });
      }

      await this.outbox.saveMany(
        products.toArray().map((product) => ({
          type: ProductRedefinedEventType,
          payload: {
            productId: product.id,
          } satisfies ProductRedefinedEventPayload,
        })),
      );
    });
  }
}
