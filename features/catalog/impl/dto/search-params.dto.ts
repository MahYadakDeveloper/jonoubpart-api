import {
  ProductSearchFilters,
  ProductSearchSort,
  SearchPagination,
} from 'repository/search';

export class SearchProductParamsDto {
  q?: string;

  filters?: ProductSearchFilters;

  sort?: ProductSearchSort;

  page?: SearchPagination;
}
