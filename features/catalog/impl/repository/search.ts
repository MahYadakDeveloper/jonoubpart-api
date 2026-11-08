import { Page, Pagination } from '@feature/shared';
import { MediaRef } from '@feature/media-api';

export interface ProductSearchCriteria {
  storefront: true | false;

  query?: string;

  filters?: ProductSearchFilters;

  sort?: ProductSearchSort;

  page?: Pagination;
}

export interface ProductSearchResult {
  page: Page<ProductSearchPageItem>;
}

export interface ProductSearchFilters {
  brandIds?: readonly string[];

  categoryIds?: readonly string[];

  fitmentId?: string;

  inStock?: boolean;

  minPrice?: number;

  maxPrice?: number;
}

export interface ProductSearchSort {
  field: ProductSortField;

  direction: SortDirection;
}

export type SortDirection = 'asc' | 'desc';

export type ProductSortField =
  | 'relevance'
  | 'price'
  | 'createdAt'
  | 'popularity'
  | 'name';

export interface SearchFacets {
  brands?: readonly SearchFacet[];

  categories?: readonly SearchFacet[];
}

export interface SearchFacet {
  id: string;

  count: number;
}

export interface ProductSearchPageItem {
  id: string;
  displayName: string;
  image: MediaRef;
  brand: {
    name: string;
    logo: MediaRef;
  };
}
