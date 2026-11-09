export const FitmentManyDeletedEventType =
  'catalog.fitment:fitment-many-deleted';
export const FitmentDeletedEventType = 'catalog.fitment:fitment-deleted';
export const FitmentManyUpdatedEventType =
  'catalog.fitment:fitment-many-updated';
export const FitmentUpdatedEventType = 'catalog.fitment:fitment-updated';

export type FitmentManyDeletedEventPayload = {
  fitmentsIds: string[];
};

export type FitmentDeletedEventPayload = {
  fitmentsId: string;
};

export type FitmentManyUpdatedEventPayload = {
  fitmentsIds: string[];
};

export type FitmentUpdatedEventPayload = {
  fitmentsId: string;
};
