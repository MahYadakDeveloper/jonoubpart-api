import { CategoryDto } from '@feature/catalog-category-api';
import { BrandDto } from '@feature/catalog.brand-api';
import { FitmentDto } from '@feature/catalog.fitment-api';
import { ImageRef } from '@feature/media-api';
import { ProductQuality } from 'model/product';

export interface ProductDto {
  id: string;
  displayName: string;
  canonicalName: string;
  aliases: string[];
  images: ImageRef[];
  brand?: BrandDto;
  categories?: CategoryDto[];
  fitments?: FitmentDto[];
  emplacement?: string;
  quality?: ProductQuality;
}
