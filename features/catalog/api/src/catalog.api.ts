import { ProductSummary } from './catalog.type';

export interface CatalogApi {
  findById(productId: string): Promise<ProductSummary>;
  findMany(productIds: string[]): Promise<ProductSummary[]>;
  findManyByStockId(stockIds: string[]): Promise<ProductSummary[]>;
  // findByBrand(
  //   req: FindProductByBrandRequest,
  // ): Promise<FindProductByBrandResponse>;
  // findByCategory(
  //   req: FindProductByCategoryRequest,
  // ): Promise<FindProductByCategoryResponse>;
}
