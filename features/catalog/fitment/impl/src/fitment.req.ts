import { Fitment } from './model/fitment';

export interface FitmentCreationRequest {
  fitmentDto: Omit<Fitment, 'id'>;
}

export interface FitmentUpdatingRequest {
  fitmentId: string;
  fitmentDto: Omit<Fitment, 'id'>;
}

export interface FitmentDeletionRequest {
  fitmentId: string;
}
