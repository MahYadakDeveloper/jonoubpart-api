import {
  FindAllRequest,
  FindAllResponse,
  FindByGoodIdRequest,
  FindByGoodIdResponse,
  ManyReplenishmentRequest,
  RemoveReplenishmentRequest,
  ReplenishmentApi,
  ReplenishmentRequest,
} from '@feature/procurement-replenishment-api';
import { Injectable } from '@nestjs/common';
import { type ReplenishmentRepository } from './replenishment.repository';
import { RemoveOneReplenishmentRequest } from './replenishment.req';

@Injectable()
export class ReplenishmentService implements ReplenishmentApi {
  constructor(private readonly repository: ReplenishmentRepository) {}

  async findAll(req: FindAllRequest): Promise<FindAllResponse> {
    const replenishment = await this.repository.findAll({ ...req });

    return { replenishment };
  }

  async findByGoodId({
    goodId,
  }: FindByGoodIdRequest): Promise<FindByGoodIdResponse> {
    const replenishment = await this.repository.findByGoodId(goodId);
    return {
      replenishment,
    };
  }

  replenish({ replenishment }: ReplenishmentRequest): Promise<void> {
    return this.repository.upsertMany([replenishment.goodId]);
  }

  replenishMany({ replenishment }: ManyReplenishmentRequest): Promise<void> {
    return this.repository.upsertMany([...replenishment.keys()]);
  }

  removeOne({ goodId }: RemoveOneReplenishmentRequest): Promise<void> {
    return this.repository.delete(goodId);
  }

  removeMany({ goodIds }: RemoveReplenishmentRequest): Promise<void> {
    return this.repository.deleteMany(goodIds);
  }
}
