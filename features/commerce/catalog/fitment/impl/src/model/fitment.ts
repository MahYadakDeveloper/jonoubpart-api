export interface Fitment {
  id: string;

  nodeReference: string;

  modelYearRange?: {
    from?: number;
    to?: number;
  };
}
