import { BrandDto } from '@feature/catalog.brand-api';

export interface BrandCreationRequest {
  brandDto: BrandDto;
}

export interface BrandDeletionRequest {
  brandId: string;
}

export interface BrandUpdatingRequest {
  brandId: string;
  brandDto: BrandDto;
}
