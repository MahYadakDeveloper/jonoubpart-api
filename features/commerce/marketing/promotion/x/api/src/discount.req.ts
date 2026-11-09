import { AppliedDiscount, LineItems } from '@feature/shared';

export interface FindApplicableDiscountRequest {
  productId: string;
  customerId: string;
}
export interface FindManyApplicableDiscountRequest {
  productIds: string[];
  customerId: string;
}

export interface DiscountUsageRecordRequest {
  customerId: string;
  appliedDiscounts: LineItems<AppliedDiscount>;
}
