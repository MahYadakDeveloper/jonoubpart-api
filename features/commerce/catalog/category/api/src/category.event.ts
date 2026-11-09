export const CategoryDeletedEventType = 'catalog:category-deleted';
export const CategoryUpdatedEventType = 'catalog:category-updated';

export type CategoryDeletedEventPayload = {
  categoryId: string;
};

export type CategoryUpdatedEventPayload = {
  categoryId: string;
};
