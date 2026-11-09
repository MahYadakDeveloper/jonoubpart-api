import {
  FindAllRequest,
  FindAllResponse,
  FindByGoodIdRequest,
  ManyReplenishmentRequest,
  RemoveReplenishmentRequest,
  ReplenishmentRequest,
} from './replenishment.req';
import { FindByGoodIdResponse } from './replenishment.res';

export interface ReplenishmentApi {
  findByGoodId(req: FindByGoodIdRequest): Promise<FindByGoodIdResponse>;
  findAll(req: FindAllRequest): Promise<FindAllResponse>;
  replenish(req: ReplenishmentRequest): Promise<void>;
  replenishMany(req: ManyReplenishmentRequest): Promise<void>;
  removeMany(req: RemoveReplenishmentRequest): Promise<void>;
}
