import { MediaRef } from '@feature/media-api';

export interface FitmentDto {
  id: string;
  make: {
    name: string;
    logo: MediaRef;
  };
  model: {
    name: string;
    image: MediaRef;
  };
  series?: string;
  modelYearRange?: {
    from?: number;
    to?: number;
  };
  fuelType?: string;
  transmission?: string;
}
