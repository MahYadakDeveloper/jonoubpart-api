import { LineItems, PartialBy } from '@feature/shared';
import { ProductDto } from 'dto/product.dto';
import { Product } from 'model/product';

export type Populate = {
  fitments?: true;
  categories?: true;
  brand?: true;
};

export type ProductPatch = Partial<ProductDto> & { id: string };

export type ProductPopulatePatch = LineItems<ProductPatch>;

export function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

export function isNotFound<T>(x: T | null): boolean {
  return x === null || x === undefined;
}

export type CreateProduct = PartialBy<Product, 'id'>;
export type UpdateProduct = PartialBy<Product, 'id' | 'kind'>;
