export const ProductRedefinedEventType = 'catalog:product-redefined';
export const ProductDeletedEventType = 'catalog:product-deleted';

export type ProductRedefinedEventPayload = { productId: string };
export type ProductDeletedEventPayload = { productId: string };
