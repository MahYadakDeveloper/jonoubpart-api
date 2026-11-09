export interface ResolveMarkupRequest {
  productId: string;
  policy: 'wholesale' | 'retail';
}

export interface ResolveManyMarkupRequest {
  productIds: string[];
  policy: 'wholesale' | 'retail';
}
