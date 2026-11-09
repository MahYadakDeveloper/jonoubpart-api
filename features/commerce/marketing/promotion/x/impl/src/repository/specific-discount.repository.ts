import { SpecificDiscount } from '../model/specific-discount';
import { DiscountRepository } from './discount.repository';

export interface SpecificDiscountRepository extends DiscountRepository<SpecificDiscount> {}
