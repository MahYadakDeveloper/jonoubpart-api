import {
  ProductRedefinedEventPayload,
  ProductRedefinedEventType,
} from '@feature/catalog-api';
import { type BrandApi } from '@feature/catalog-brand-api';
import {
  type FitmentApi,
  FitmentDeletedEventPayload,
  FitmentDeletedEventType,
} from '@feature/catalog.fitment-api';
import {
  BaseEventHandler,
  type EventHandlerRegistry,
  type OutboxRepository,
  type TransactionManager,
} from '@feature/shared';
import { Injectable } from '@nestjs/common';
import { UpdateProduct } from 'catalog.types';
import { type CatalogRepository } from 'repository/catalog.repository';
import { generateSearchText } from 'utils/generate-search-text';

@Injectable()
export class FitmentDeletedEventHandler extends BaseEventHandler<FitmentDeletedEventPayload> {
  constructor(
    registry: EventHandlerRegistry,
    private readonly repository: CatalogRepository,
    private readonly fitment: FitmentApi,
    private readonly brand: BrandApi,
    private readonly tx: TransactionManager,
    private readonly outbox: OutboxRepository,
  ) {
    super(registry, FitmentDeletedEventType);
  }

  async handle(payload: FitmentDeletedEventPayload): Promise<void> {
    const products = await this.repository.findMany({
      where: { references: { fitmentIds: { has: payload.fitmentsId } } },
    });

    if (products.size === 0) return;

    await this.tx.run(async () => {
      // Updating

      // Resolving fitments
      const productWithNonDeletedFitments = products.transform(
        (product) => ({
          productId: product.id,
          nonDeletedFitments: product.references.fitmentIds.filter(
            (id) => payload.fitmentsId !== id,
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

      const updates: Array<{ id: string; data: UpdateProduct }> = [];

      for (const product of products) {
        const brandId = product.references.brandId;
        const nonDeletedFitmentIds = productWithNonDeletedFitments.getOrThrow(
          product.id,
        ).nonDeletedFitments;
        updates.push({
          id: product.id,
          data: {
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
          },
        });
      }

      await this.repository.updateManyById(updates);

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
