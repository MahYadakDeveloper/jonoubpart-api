import { LineItems } from '@feature/shared';
import { Fitment } from '../model/fitment';

export interface FitmentRepository {
  find(id: string): Promise<Fitment | null>;
  findMany(ids: string[]): Promise<LineItems<Fitment>>;

  /**
   * [TODO] Find many fitment references for each corresponding node
   * Fitment(*) -> (1)Node
   */
  findManyByReferredFitment(nodeIds: string[]): Promise<LineItems<Fitment>>;

  create(data: Omit<Fitment, 'id'>): Promise<string>;

  update(id: string, data: Omit<Fitment, 'id'>): Promise<void>;

  delete(id: string): Promise<void>;
  deleteMany(ids: string[]): Promise<void>;
}
