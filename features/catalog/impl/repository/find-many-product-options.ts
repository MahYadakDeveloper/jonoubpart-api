type StringArrayFilter = {
  in?: string[];
  has?: string;
  hasSome?: string[];
  hasEvery?: string[];
};

export interface ProductWhere {
  references?: {
    categoryIds?: StringArrayFilter;
    fitmentIds?: StringArrayFilter;
    brandId?: {
      equals?: string;
      in?: string[];
    };
  };
}

export interface FindManyProductsOptions {
  where?: ProductWhere;
}
