import { FindCategoryRequest, FindManyCategoryRequest } from './category.req';
import { FindCategoryResponse, FindManyCategoryResponse } from './category.res';

export interface CategoryApi {
  find(request: FindCategoryRequest): Promise<FindCategoryResponse>;
  findMany(request: FindManyCategoryRequest): Promise<FindManyCategoryResponse>;
}
