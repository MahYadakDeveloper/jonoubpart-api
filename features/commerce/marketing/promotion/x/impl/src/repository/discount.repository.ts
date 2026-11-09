import { LineItems } from '@feature/shared';

export interface DiscountRepository<T> {
  findManyByIds(discountIds: string[]): Promise<LineItems<T>>;
  findByProductId(productId: string): Promise<T | undefined>;
  findManyByProductIds(productIds: string[]): Promise<LineItems<T>>;
}
