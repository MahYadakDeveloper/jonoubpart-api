import {
  DiscountUsageRecordRequest,
  FindApplicableDiscountRequest,
  FindManyApplicableDiscountRequest,
} from './discount.req';
import {
  FindApplicableDiscountResponse,
  FindManyApplicableDiscountResponse,
} from './discount.res';

export interface DiscountApi {
  /**
   * Calculates the discount that can be applied to a product for a specific
   * customer, based on the product's discount policy and the customer's
   * remaining eligibility.
   *
   * For example, a product may have a promotion that discounts up to 10 units
   * in total, while each customer is limited to purchasing only 2 discounted
   * units. Any additional units purchased by the same customer are charged at
   * the regular price. The customer's previous discounted purchases are also
   * taken into account when determining eligibility.
   *
   * Discounts are not applied to wholesale sales.
   *
   * @returns The total discount amount applicable to the requested purchase.
   */
  findApplicableDiscount(
    req: FindApplicableDiscountRequest,
  ): Promise<FindApplicableDiscountResponse>;

  findManyApplicableDiscount(
    req: FindManyApplicableDiscountRequest,
  ): Promise<FindManyApplicableDiscountResponse>;

  commitDiscountUsages(req: DiscountUsageRecordRequest): Promise<void>;
}
