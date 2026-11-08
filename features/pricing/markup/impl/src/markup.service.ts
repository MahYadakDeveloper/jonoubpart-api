import { ProductDto, type CatalogApi } from '@feature/catalog-api';
import { type BrandApi } from '@feature/catalog-brand-api';
import { type CategoryApi } from '@feature/catalog-category-api';
import {
  LineItems,
  type OutboxRepository,
  type TransactionManager,
} from '@feature/shared';
import {
  MarkupDto,
  MarkupPolicyApi,
  MarkupPolicyCreatedEventType,
  MarkupPolicyEventPayload,
  MarkupPolicyUpdatedEventType,
  ResolveManyMarkupRequest,
  ResolveManyMarkupResponse,
  ResolveMarkupRequest,
  ResolveMarkupResponse,
} from '@feature/pricing-markup-api';
import { Injectable } from '@nestjs/common';
import {
  MarkupReference,
  type MarkupPolicyRepository,
} from './markup.repository';
import {
  GlobalMarkupPolicyRequest,
  GlobalMarkupPolicySettingRequest,
  MarkupCreationRequest,
  MarkupUpdateRequest,
} from './markup.req';
import { GlobalMarkupPolicyResponse } from './markup.res';
import { MarkupPolicyByScope, PrioritizedMarkupPolicy } from './markup.types';
import { MarkupPolicy, MarkupScope } from './model/markup-policy';

@Injectable()
export class MarkupPolicyService implements MarkupPolicyApi {
  constructor(
    private readonly repository: MarkupPolicyRepository,
    private readonly catalog: CatalogApi,
    private readonly brand: BrandApi,
    private readonly category: CategoryApi,
    private readonly tx: TransactionManager,
    private readonly outbox: OutboxRepository,
  ) {}

  async resolve({
    productId,
    policy,
  }: ResolveMarkupRequest): Promise<ResolveMarkupResponse> {
    const { markups } = await this.resolveMany({
      productIds: [productId],
      policy,
    });
    return {
      markup: markups.getOrThrow(
        productId,
        (id) => new Error(`Markup not resolved for product: ${id}`),
      ),
    };
  }

  async resolveMany({
    productIds,
    policy,
  }: ResolveManyMarkupRequest): Promise<ResolveManyMarkupResponse> {
    const { products } = await this.catalog.findMany({ productIds });

    if (policy === 'wholesale') {
      const markups = new LineItems<MarkupDto>((x) => x.productId);
      const wholesaleMarkup =
        await this.repository.getGlobalMarkup('wholesale');
      for (const product of products) {
        markups.set({ productId: product.id, rate: wholesaleMarkup.rate });
      }
      return { markups };
    }

    const references = this.getMarkupReferences(products);
    const markupPolicies =
      await this.repository.findManyByReference(references);
    const productMarkupPolicies = this.filterMarkupPoliciesWithScope(
      markupPolicies,
      'product',
    );
    const categoryMarkupPolicies = this.filterMarkupPoliciesWithScope(
      markupPolicies,
      'category',
    );
    const brandMarkupPolicies = this.filterMarkupPoliciesWithScope(
      markupPolicies,
      'brand',
    );
    const globalMarkupPolicy = await this.repository.getGlobalMarkup('retail');

    const markups = new LineItems<MarkupDto>((x) => x.productId);

    // [NOTE] Product > ([Category | Brand] Priority) > Global
    for (const product of products) {
      const productMarkup = productMarkupPolicies.get(product.id);

      if (productMarkup) {
        markups.set({
          productId: product.id,
          rate: productMarkup.rate,
        });
        continue;
      }

      const categoryMarkup = product.references.categoryIds.reduce(
        this.highestPriorityReducer((id) => categoryMarkupPolicies.get(id)),
        undefined,
      );

      const brandMarkup = product.references.brandId
        ? brandMarkupPolicies.get(product.references.brandId)
        : undefined;

      const scopedMarkup = this.selectHigherPriority(
        categoryMarkup,
        brandMarkup,
      );

      markups.set({
        productId: product.id,
        rate: scopedMarkup?.rate ?? globalMarkupPolicy.rate,
      });
    }

    return {
      markups,
    };
  }

  async getGlobal({
    variant,
  }: GlobalMarkupPolicyRequest): Promise<GlobalMarkupPolicyResponse> {
    const m = await this.repository.getGlobalMarkup(variant);
    return {
      markup: {
        variant: m.variant,
        rate: m.rate,
      },
    };
  }

  async setGlobal({
    variant,
    rate,
  }: GlobalMarkupPolicySettingRequest): Promise<void> {
    await this.tx.run(async () => {
      await this.repository.setGlobalMarkup(variant, rate);
      await this.outbox.save({
        type: MarkupPolicyUpdatedEventType,
        payload: {
          scope: 'global',
        } satisfies MarkupPolicyEventPayload,
      });
    });
  }

  async create({ markup }: MarkupCreationRequest): Promise<{ id: string }> {
    const m = await this.repository.findByReference({
      scope: markup.scope,
      referenceId: markup.referenceId,
    });
    if (m) throw new Error('');

    switch (markup.scope) {
      case 'product':
        const { product } = await this.catalog.find({
          productId: markup.referenceId,
        }); // this means the product exists otherwise throws an error
        if (!product) throw new Error(''); // Anyway it throws if the api not throw
        break;
      case 'brand':
        const { brand } = await this.brand.find({
          brandId: markup.referenceId,
        });

        if (!brand) throw new Error(''); // Anyway it throws if the api not throw
        break;
      case 'category':
        const { category } = await this.category.find({
          categoryId: markup.referenceId,
        });

        if (!category) throw new Error(''); // Anyway it throws if the api not throw
        break;
    }

    const id = await this.tx.run(async () => {
      const id = await this.repository.create(markup);

      await this.outbox.save({
        type: MarkupPolicyCreatedEventType,
        payload: {
          scope: markup.scope,
          referenceId: markup.referenceId,
        } satisfies MarkupPolicyEventPayload,
      });
      return id;
    });

    return { id };
  }

  /**
   * [NOTE] This method only allow updating the rate.
   */
  async update({ markup }: MarkupUpdateRequest): Promise<void> {
    const m = await this.repository.findById(markup.id);

    if (!m) throw new Error('');

    await this.tx.run(async () => {
      await this.repository.update(markup);
      await this.outbox.save({
        type: MarkupPolicyUpdatedEventType,
        payload: {
          scope: m.scope,
          referenceId: m.referenceId,
        } satisfies MarkupPolicyEventPayload,
      });
    });
  }

  private getMarkupReferences(
    products: LineItems<ProductDto>,
  ): MarkupReference[] {
    return products
      .transform<{ id: string; references: MarkupReference[] }>(
        (p) => {
          const _references: MarkupReference[] = [];
          if (p.references.brandId)
            _references.push({
              scope: 'brand',
              referenceId: p.references.brandId,
            });

          if (p.references.categoryIds.length > 0)
            p.references.categoryIds.forEach((categoryId) => {
              _references.push({ scope: 'category', referenceId: categoryId });
            });

          _references.push({ scope: 'product', referenceId: p.id });

          return { id: p.id, references: _references };
        },
        (x) => x.id,
      )
      .toArray()
      .flatMap((r) => r.references);
  }

  private highestPriorityReducer<T extends { priority: number }>(
    getItem: (key: string) => T | undefined,
  ): (prev: T | undefined, curr: string) => T | undefined {
    return (prev: T | undefined, curr: string): T | undefined => {
      const current = getItem(curr);

      if (!current) return prev;

      return !prev || current.priority > prev.priority ? current : prev;
    };
  }

  private selectHigherPriority(
    a?: PrioritizedMarkupPolicy,
    b?: PrioritizedMarkupPolicy,
  ): PrioritizedMarkupPolicy | undefined {
    if (!a) return b;
    if (!b) return a;

    return a.priority >= b.priority ? a : b;
  }

  private filterMarkupPoliciesWithScope<T extends MarkupScope>(
    markupPolicies: LineItems<MarkupPolicy>,
    scope: T,
  ): LineItems<MarkupPolicyByScope<T>> {
    const result = new LineItems<MarkupPolicyByScope<T>>((p) => p.id);

    for (const policy of markupPolicies) {
      if (this.hasScope(policy, scope)) {
        result.set(policy);
      }
    }

    return result;
  }
  private hasScope<T extends MarkupScope>(
    policy: MarkupPolicy,
    scope: T,
  ): policy is MarkupPolicyByScope<T> {
    return policy.scope === scope;
  }
}
