import { LineItems } from '@feature/shared';
import { CategoryDto } from './category.dto';

export interface FindCategoryResponse {
  category: CategoryDto;
}

export interface FindManyCategoryResponse {
  categories: LineItems<CategoryDto>;
}
