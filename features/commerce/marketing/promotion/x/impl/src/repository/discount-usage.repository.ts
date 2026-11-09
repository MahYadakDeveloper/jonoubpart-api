import { LineItems } from '@feature/shared';
import { DiscountUsage } from '../model/discount-usage';

export interface DiscountUsageRepository {
  findCustomerUsage(
    customerId: string,
    discountId: string,
  ): Promise<DiscountUsage | null>;
  findDiscountUsages(discountId: string): Promise<LineItems<DiscountUsage>>;
  findCustomerUsages(
    customerId: string,
    discountIds: string[],
  ): Promise<LineItems<DiscountUsage>>;

  findDiscountUsages(
    discountIds: string[],
  ): Promise<LineItems<LineItems<DiscountUsage>>>;
  upsertMany(usages: LineItems<DiscountUsage>): Promise<void>;
}
