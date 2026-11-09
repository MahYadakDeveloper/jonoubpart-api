export const BrandDeletedEventType = 'catalog:brand-deleted';
export const BrandUpdatedEventType = 'catalog:brand-updated';
export type BrandDeletedEventPayload = {
  brandId: string;
};
export type BrandUpdatedEventPayload = {
  brandId: string;
};
