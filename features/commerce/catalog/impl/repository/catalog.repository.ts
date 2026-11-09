import { LineItems } from '@feature/shared';
import { CreateProduct, UpdateProduct } from 'catalog.types';
import { Product } from 'model/product';
import { FindManyProductsOptions } from './find-many-product-options';
import { ProductSearchCriteria, ProductSearchResult } from './search';

export interface CatalogRepository {
  findMany(filter: FindManyProductsOptions): Promise<LineItems<Product>>;
  findById(id: string): Promise<Product | null>;
  findManyById(ids: string[]): Promise<LineItems<Product>>;
  findByGoodId(id: string): Promise<Product | null>;
  findManyByGoodId(goodIds: string[]): Promise<LineItems<Product>>;
  search(criteria: ProductSearchCriteria): Promise<ProductSearchResult>;

  create(data: CreateProduct): Promise<{ id: string }>;

  update(id: string, data: UpdateProduct): Promise<void>;
  updateManyById(updates: { id: string; data: UpdateProduct }[]): Promise<void>;

  delete(id: string): Promise<void>;
  deleteMany(ids: string[]): Promise<void>;
}
