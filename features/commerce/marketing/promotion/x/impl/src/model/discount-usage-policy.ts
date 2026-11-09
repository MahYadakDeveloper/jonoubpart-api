import { Money } from '@feature/shared';

export type DiscountUsagePolicy =
  | {
      kind: 'limited';
      maxTotalUses: number;
      maxUsesPerCustomer: number;
      expiresAt?: Date;
    }
  | {
      kind: 'unlimited';
    };
