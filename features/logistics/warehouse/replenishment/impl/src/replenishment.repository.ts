import { LineItems } from '@feature/shared';
import { Replenishment } from './model/replenishment';

export interface ReplenishmentRepository {
  findByGoodId(goodId: string): Promise<Replenishment>;
  findAll({
    take,
    skip,
  }: {
    take?: number;
    skip?: number;
  }): Promise<LineItems<Replenishment>>;

  upsertMany(goodIds: string[]): Promise<void>;

  delete(goodId: string): Promise<void>;
  deleteMany(goodIds: string[]): Promise<void>;
}
