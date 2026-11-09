import { FindBrandRequest, FindManyBrandRequest } from './brand.req';
import { FindBrandResponse, FindManyBrandResponse } from './brand.res';

export interface BrandApi {
  find(request: FindBrandRequest): Promise<FindBrandResponse>;
  findMany(request: FindManyBrandRequest): Promise<FindManyBrandResponse>;
}
