import { LineItems, PageCriteria, PageResult } from '@feature/shared';
import { ReplenishmentPolicy } from './model/replenishment';

export interface ReplenishmentPolicyRepository {
  findManyByGoodId(goodIds: string[]): Promise<LineItems<ReplenishmentPolicy>>;
  list(criteria: PageCriteria): Promise<PageResult<ReplenishmentPolicy>>;
  create(replenishment: ReplenishmentPolicy): Promise<void>;
  update(replenishment: ReplenishmentPolicy): Promise<void>;
  delete(goodId: string): Promise<void>;
}
