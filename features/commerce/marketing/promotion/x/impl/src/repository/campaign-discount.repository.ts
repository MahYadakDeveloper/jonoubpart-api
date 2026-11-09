import { CampaignDiscountItem } from '../model/discount-campaign';
import { DiscountRepository } from './discount.repository';

export interface CampaignDiscountRepository extends DiscountRepository<CampaignDiscountItem> {}
