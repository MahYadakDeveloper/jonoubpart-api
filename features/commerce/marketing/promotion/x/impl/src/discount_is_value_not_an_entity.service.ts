import {
  AppliedDiscount,
  CustomerType,
  LineItems,
  type Synchronizer,
} from '@feature/shared';
import {
  ApplicableDiscount,
  DiscountApi,
  DiscountUsageRecordRequest,
  FindApplicableDiscountRequest,
  FindApplicableDiscountResponse,
  FindManyApplicableDiscountRequest,
  FindManyApplicableDiscountResponse,
} from '@feature/discount-api';
import { type PricingApi } from '@feature/pricing-api';
import { Injectable } from '@nestjs/common';
import { DiscountCustomerUsageLimitExceededError } from './errors/discount-customer-usage-limit-exceeded-error';
import { DiscountTotalUsageLimitExceededError } from './errors/discount-total-usage-limit-exceeded-error';
import { DiscountUsage } from './model/discount-usage';
import { DiscountUsagePolicy } from './model/discount-usage-policy';
import { DiscountWithUsagePolicy } from './model/discount-with-usage-policy';
import { type CampaignDiscountRepository } from './repository/campaign-discount.repository';
import { type DiscountUsageRepository } from './repository/discount-usage.repository';
import { type SpecificDiscountRepository } from './repository/specific-discount.repository';

@Injectable()
export class DiscountService implements DiscountApi {
  constructor(
    private readonly discountUsageRepository: DiscountUsageRepository,
    private readonly campaignDiscountRepository: CampaignDiscountRepository,
    private readonly specificDiscountRepository: SpecificDiscountRepository,
    private readonly pricing: PricingApi,
    private readonly synchronizer: Synchronizer,
  ) {}
  private static readonly SYNCHRONIZER_LOCK_KEY =
    'DiscountUsageConsumptionLock';

  // [TODO] Create a service method that does create discounts[campaign | individual]

  /**
   * Updates discount usage records after a sale is completed. If the sale contains
   * discounted products, the customer's discount usage is recorded so future
   * eligibility checks can enforce per-customer limits defined by the discount policy.
   */
  async commitDiscountUsages({
    customer,
    appliedDiscounts,
  }: DiscountUsageRecordRequest): Promise<void> {
    const requestedUsages = this.collectRequestedUsages(appliedDiscounts);

    if (requestedUsages.size === 0) return;

    await this.synchronizer.executeExclusive(
      DiscountService.SYNCHRONIZER_LOCK_KEY,
      async () => {
        const discountIds = requestedUsages.keys();

        const [specificDiscounts, campaignDiscounts] = await Promise.all([
          this.specificDiscountRepository.findManyByIds([...discountIds]),
          this.campaignDiscountRepository.findManyByIds([...discountIds]),
        ]);

        const discounts = new LineItems<DiscountWithUsagePolicy>((x) => x.id);

        for (const discount of [...specificDiscounts, ...campaignDiscounts]) {
          discounts.set(discount);
        }
        const [customerUsages, discountUsages] = await Promise.all([
          this.discountUsageRepository.findCustomerUsages(customer.id, [
            ...discountIds,
          ]),
          this.discountUsageRepository.findDiscountUsages([...discountIds]),
        ]);

        this.validateRequestedUsages({
          requestedUsages,
          customerUsages,
          discountUsages,
          discounts,
        });

        // The upsert method going to update if discountId existed otherwise going to create new row
        await this.discountUsageRepository.upsertMany(
          requestedUsages.transform(
            (x) => ({
              customerId: customer.id,
              ...x,
            }),
            (x) => x.discountId,
          ),
        );
      },
    );
  }

  async findManyApplicableDiscount({
    customer,
    productIds,
  }: FindManyApplicableDiscountRequest): Promise<FindManyApplicableDiscountResponse> {
    if (this.resolvePolicy(customer.type) === 'wholesale') {
      return {
        discounts: new LineItems<{
          productId: string;
          discount: ApplicableDiscount;
        }>((x) => x.productId),
      };
    }

    const [specificDiscounts, campaignDiscounts] = await Promise.all([
      this.specificDiscountRepository.findManyByProductIds(productIds),
      this.campaignDiscountRepository.findManyByProductIds(productIds),
    ]);

    const discounts = new LineItems<{
      productId: string;
      discount: ApplicableDiscount;
    }>((x) => x.productId);

    const allDiscounts = [...specificDiscounts, ...campaignDiscounts];

    const quantities = await this.resolveApplicableQuantities({
      customerId: customer.id,
      discounts: allDiscounts,
    });

    // Specific discount has higher priority
    for (const discount of specificDiscounts) {
      discounts.set({
        productId: discount.productId,
        discount: {
          ...discount,
          applicableQuantity: quantities.getOrThrow(
            discount.id,
            () => new Error('Applicable quantity not resolved.'),
          ).applicableQuantity,
          kind: 'specific',
        },
      });
    }
    // Campaign discount applies only if no specific discount exists
    for (const discount of campaignDiscounts) {
      if (discounts.has(discount.productId)) continue;

      discounts.set({
        productId: discount.productId,
        discount: {
          ...discount,
          applicableQuantity: quantities.getOrThrow(
            discount.id,
            () => new Error('Applicable quantity not resolved.'),
          ).applicableQuantity,
          kind: 'campaign',
        },
      });
    }

    return {
      discounts,
    };
  }

  async findApplicableDiscount({
    customer,
    productId,
  }: FindApplicableDiscountRequest): Promise<FindApplicableDiscountResponse> {
    // Eligibility check
    if (this.resolvePolicy(customer.type) === 'wholesale') return {};

    const specificDiscount =
      await this.specificDiscountRepository.findByProductId(productId);

    if (specificDiscount) {
      return {
        discount: {
          ...specificDiscount,
          applicableQuantity: await this.resolveApplicableQuantity({
            customerId: customer.id,
            discount: specificDiscount,
          }),
          kind: 'specific',
        },
      };
    }

    const campaignDiscount =
      await this.campaignDiscountRepository.findByProductId(productId);

    if (campaignDiscount) {
      return {
        discount: {
          ...campaignDiscount,
          applicableQuantity: await this.resolveApplicableQuantity({
            customerId: customer.id,
            discount: campaignDiscount,
          }),
          kind: 'campaign',
        },
      };
    }

    return {};
  }

  private resolvePolicy(customerType: CustomerType): 'wholesale' | 'retail' {
    return customerType === 'merchant' ? 'wholesale' : 'retail';
  }

  private async resolveApplicableQuantity({
    customerId,
    discount,
  }: {
    customerId: string;
    discount: {
      id: string;
      usagePolicy: DiscountUsagePolicy;
    };
  }): Promise<'unlimited' | number> {
    if (discount.usagePolicy.kind === 'unlimited') {
      return 'unlimited';
    }

    const [customerUsage, discountUsages] = await Promise.all([
      this.discountUsageRepository.findCustomerUsage(customerId, discount.id),
      this.discountUsageRepository.findDiscountUsages(discount.id),
    ]);

    return this.calculateApplicableQuantity({
      usagePolicy: discount.usagePolicy,
      customerUsage,
      discountUsages,
    });
  }

  private async resolveApplicableQuantities({
    customerId,
    discounts,
  }: {
    customerId: string;
    discounts: DiscountWithUsagePolicy[];
  }): Promise<
    LineItems<{
      discountId: string;
      applicableQuantity: 'unlimited' | number;
    }>
  > {
    const result = new LineItems<{
      discountId: string;
      applicableQuantity: 'unlimited' | number;
    }>((x) => x.discountId);

    const limitedDiscounts = discounts.filter(
      (discount) => discount.usagePolicy.kind === 'limited',
    );

    for (const discount of discounts) {
      if (discount.usagePolicy.kind === 'unlimited') {
        result.set({
          discountId: discount.id,
          applicableQuantity: 'unlimited',
        });
      }
    }

    if (limitedDiscounts.length === 0) {
      return result;
    }

    const discountIds = limitedDiscounts.map((discount) => discount.id);

    const [customerUsages, discountUsages] = await Promise.all([
      this.discountUsageRepository.findCustomerUsages(customerId, discountIds),
      this.discountUsageRepository.findDiscountUsages(discountIds),
    ]);

    const emptyLineItems = LineItems.empty<DiscountUsage>((x) => x.discountId);
    for (const discount of limitedDiscounts) {
      // if (discount.usagePolicy.kind === "unlimited") continue;
      result.set({
        discountId: discount.id,
        applicableQuantity: this.calculateApplicableQuantity({
          usagePolicy: discount.usagePolicy as Extract<
            DiscountUsagePolicy,
            { kind: 'limited' }
          >,
          customerUsage: customerUsages.get(discount.id) ?? null,
          discountUsages: discountUsages.get(discount.id) ?? emptyLineItems,
        }),
      });
    }

    return result;
  }

  private validateRequestedUsages({
    requestedUsages,
    customerUsages,
    discountUsages,
    discounts,
  }: {
    requestedUsages: LineItems<Omit<DiscountUsage, 'customerId'>>;
    customerUsages: LineItems<DiscountUsage>;
    discountUsages: LineItems<LineItems<DiscountUsage>>;
    discounts: LineItems<DiscountWithUsagePolicy>;
  }): void {
    const emptyDiscountUsages = new LineItems<DiscountUsage>(
      (x) => x.discountId,
    );

    for (const requestedUsage of requestedUsages) {
      const discount = discounts.getOrThrow(
        requestedUsage.discountId,
        () => new Error('Discount not found.'),
      );

      if (discount.usagePolicy.kind === 'unlimited') {
        continue;
      }

      const customerUsed =
        customerUsages.get(requestedUsage.discountId)?.usedQuantity ?? 0;

      const usages =
        discountUsages.get(requestedUsage.discountId) ?? emptyDiscountUsages;

      const totalUsed = usages.reduce(
        (total, usage) => total + usage.usedQuantity,
        0,
      );

      const remainingForCustomer =
        discount.usagePolicy.maxUsesPerCustomer - customerUsed;

      const remainingTotal = discount.usagePolicy.maxTotalUses - totalUsed;

      if (requestedUsage.usedQuantity > remainingTotal) {
        throw new DiscountTotalUsageLimitExceededError(
          requestedUsage.discountId,
        );
      }

      if (requestedUsage.usedQuantity > remainingForCustomer) {
        throw new DiscountCustomerUsageLimitExceededError(
          requestedUsage.discountId,
        );
      }
    }
  }
  private collectRequestedUsages(
    appliedDiscounts: LineItems<AppliedDiscount>,
  ): LineItems<Omit<DiscountUsage, 'customerId'>> {
    const usages = new LineItems<Omit<DiscountUsage, 'customerId'>>(
      (usage) => usage.discountId,
    );

    for (const item of appliedDiscounts) {
      const current = usages.get(item.source.id);

      if (current) {
        usages.set({
          discountId: item.source.id,
          usedQuantity: current.usedQuantity + item.discountedQuantity,
        });
        continue;
      }

      usages.set({
        discountId: item.source.id,
        usedQuantity: item.discountedQuantity,
      });
    }

    return usages;
  }

  private calculateApplicableQuantity({
    usagePolicy,
    customerUsage,
    discountUsages,
  }: {
    usagePolicy: Extract<DiscountUsagePolicy, { kind: 'limited' }>;
    customerUsage: DiscountUsage | null;
    discountUsages: LineItems<DiscountUsage>;
  }): number {
    const totalQuantityUsed = discountUsages.reduce(
      (total, usage) => total + usage.usedQuantity,
      0,
    );

    const customerQuantityUsed = customerUsage?.usedQuantity ?? 0;

    return Math.max(
      Math.min(
        usagePolicy.maxTotalUses - totalQuantityUsed,
        usagePolicy.maxUsesPerCustomer - customerQuantityUsed,
      ),
      0,
    );
  }
}
