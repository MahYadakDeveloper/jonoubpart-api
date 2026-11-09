import { DiscountUsagePolicy } from './discount-usage-policy';

export type DiscountWithUsagePolicy = {
  id: string;
  usagePolicy: DiscountUsagePolicy;
};
