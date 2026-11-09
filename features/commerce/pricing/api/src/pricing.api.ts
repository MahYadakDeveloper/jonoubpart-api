import { PriceItemRequest, PriceResult, PricingContext } from './pricing.types';

export interface PricingApi {
  /**
   * [NOTE]
   * Just this method is sufficient for all modules to resolve for pricing
   */
  price(ctx: PricingContext, items: PriceItemRequest[]): Promise<PriceResult>;
}
