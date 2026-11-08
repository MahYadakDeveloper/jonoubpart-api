import { LineItems } from '@feature/shared';
import { BrandDto } from './brand.dto';

export interface FindBrandResponse {
  brand: BrandDto | null;
}

export interface FindManyBrandResponse {
  brands: LineItems<BrandDto>;
}
