import { LineItems } from '@feature/shared';
import { DiscountUsagePolicy } from './discount-usage-policy';

type UnlimitedUsagePolicy = Extract<DiscountUsagePolicy, { kind: 'unlimited' }>;

type LimitedUsagePolicyWithoutExpiry = Omit<
  Extract<DiscountUsagePolicy, { kind: 'limited' }>,
  'expiresAt'
>;

type CampaignUsagePolicy =
  | UnlimitedUsagePolicy
  | LimitedUsagePolicyWithoutExpiry;

export type CampaignDiscountItem = {
  id: string;
  productId: string;
  usagePolicy: CampaignUsagePolicy;
  displayDiscountRate: number;
  realDiscountRate: number;
};

export type DiscountCampaign = {
  id: string;
  name: string;

  startedAt: Date;
  expiresAt: Date;

  defaultDisplayDiscountRate: number;
  defaultRealDiscountRate: number;

  // fake & real

  items: LineItems<CampaignDiscountItem>;
};
