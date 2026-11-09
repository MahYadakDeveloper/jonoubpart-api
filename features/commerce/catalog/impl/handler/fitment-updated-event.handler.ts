import {
  ProductRedefinedEventPayload,
  ProductRedefinedEventType,
} from '@feature/catalog-api';
import { type BrandApi } from '@feature/catalog-brand-api';
import {
  type FitmentApi,
  FitmentUpdatedEventPayload,
  FitmentUpdatedEventType,
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
export class FitmentUpdatedEventHandler extends BaseEventHandler<FitmentUpdatedEventPayload> {
  constructor(
    registry: EventHandlerRegistry,
    private readonly repository: CatalogRepository,
    private readonly fitment: FitmentApi,
    private readonly brand: BrandApi,
    private readonly tx: TransactionManager,
    private readonly outbox: OutboxRepository,
  ) {
    super(registry, FitmentUpdatedEventType);
  }

  async handle(payload: FitmentUpdatedEventPayload): Promise<void> {
    const products = await this.repository.findMany({
      where: { references: { fitmentIds: { has: payload.fitmentsId } } },
    });

    if (products.size === 0) return;

    await this.tx.run(async () => {
      // Updating
      //
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
        await this.repository.update(product.id, {
          ...product,
          searchText: generateSearchText({
            canonicalName: product.canonicalName,
            aliases: product.aliases,
            fitments: productFitments
              .getOrThrow(product.id)
              .fitmentIds.map((fitmentId) => fitments.getOrThrow(fitmentId))
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
