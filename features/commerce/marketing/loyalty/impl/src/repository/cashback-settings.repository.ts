import { CustomerType } from '@feature/shared';

export type CashbackPolicyVariant = Exclude<CustomerType, 'merchant'>;

export type CashbackPolicy =
  | {
      enabled: false;
    }
  | {
      enabled: true;
      rate: number;
    };

export interface CashbackSettingsRepository {
  getPolicy(variant: CashbackPolicyVariant): Promise<CashbackPolicy>;

  setPolicy(
    variant: CashbackPolicyVariant,
    policy: CashbackPolicy,
  ): Promise<void>;
}
