import {
  ProductRedefinedEventPayload,
  ProductRedefinedEventType,
} from '@feature/catalog-api';
import { type BrandApi } from '@feature/catalog-brand-api';
import {
  type FitmentApi,
  FitmentManyDeletedEventPayload,
  FitmentManyDeletedEventType,
} from '@feature/catalog.fitment-api';
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
export class FitmentManyDeletedEventHandler extends BaseEventHandler<FitmentManyDeletedEventPayload> {
  constructor(
    registry: EventHandlerRegistry,
    private readonly repository: CatalogRepository,
    private readonly fitment: FitmentApi,
    private readonly brand: BrandApi,
    private readonly tx: TransactionManager,
    private readonly outbox: OutboxRepository,
  ) {
    super(registry, FitmentManyDeletedEventType);
  }

  async handle(payload: FitmentManyDeletedEventPayload): Promise<void> {
    const products = await this.repository.findMany({
      where: { references: { fitmentIds: { hasSome: payload.fitmentsIds } } },
    });
    if (products.size === 0) return;

    await this.tx.run(async () => {
      // Updating

      // Resolving fitments
      const productWithNonDeletedFitments = products.transform(
        (product) => ({
          productId: product.id,
          nonDeletedFitments: product.references.fitmentIds.filter(
            (id) => !payload.fitmentsIds.find((_id) => _id === id),
          ),
        }),
        (x) => x.productId,
      );
      const fitmentIds = [
        ...new Set(
          productWithNonDeletedFitments
            .toArray()
            .flatMap((x) => x.nonDeletedFitments),
        ),
      ];
      const { fitments } = await this.fitment.findMany({ fitmentIds });

      // Resolving brands
      const { brands } = await this.brand.findMany({
        brandIds: [
          ...new Set(
            products
              .transform(
                (product) => ({
                  productId: product.id,
                  brandId: product.references.brandId,
                }),
                (p) => p.productId,
              )
              .toArray()
              .map((x) => x.brandId)
              .filter((brandId): brandId is string => brandId !== undefined),
          ),
        ],
      });

      for (const product of products) {
        const brandId = product.references.brandId;
        const nonDeletedFitmentIds = productWithNonDeletedFitments.getOrThrow(
          product.id,
        ).nonDeletedFitments;
        await this.repository.update(product.id, {
          ...product,
          references: {
            ...product.references,
            fitmentIds: nonDeletedFitmentIds,
          },
          searchText: generateSearchText({
            canonicalName: product.canonicalName,
            aliases: product.aliases,
            fitments: nonDeletedFitmentIds
              .map((fitmentId) => fitments.getOrThrow(fitmentId))
              .toLineItems((fitment) => fitment.id),
            brand: brandId ? brands.get(brandId) : undefined,
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
