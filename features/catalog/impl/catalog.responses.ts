import { LineItems } from '@feature/shared';
import { ProductDto } from 'dto/product.dto';

export interface FindByBarcodeResponse {
  product: ProductDto;
}

export interface FindProductResponse {
  product: ProductDto;
}

export interface FindManyByReferencedFitmentsResponse {
  products: LineItems<ProductDto>;
}

export interface FindManyProductResponse {
  products: LineItems<ProductDto>;
}

export interface DefiningProductResponse {
  productId: string;
}
