import { Money } from '@feature/shared';

export type ApplicableSpecificDiscount = {
  id: string;
  displayDiscountPerUnit: Money;
  realDiscountPerUnit: Money;
  applicableQuantity: 'unlimited' | number;
};

export type ApplicableCampaignDiscount = {
  id: string;
  displayDiscountRate: number;
  realDiscountRate: number;
  applicableQuantity: 'unlimited' | number;
};

export type ApplicableDiscount =
  | (ApplicableCampaignDiscount & { kind: 'campaign' })
  | (ApplicableSpecificDiscount & { kind: 'specific' });
