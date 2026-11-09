import {
  BaseEventHandler,
  LineItems,
  type EventHandlerRegistry,
} from '@feature/shared';
import {
  Replenishment,
  type ReplenishmentApi,
} from '@feature/procurement-replenishment-api';
import {
  GoodsIssuedEventPayload,
  GoodsIssuedEventType,
  type WarehouseApi,
} from '@feature/warehouse-api';
import { Injectable } from '@nestjs/common';
import { type ReplenishmentPolicyRepository } from '../replenishment-policy.repository';

@Injectable()
export class GoodsIssuedEventHandler extends BaseEventHandler<GoodsIssuedEventPayload> {
  constructor(
    registry: EventHandlerRegistry,
    private readonly repository: ReplenishmentPolicyRepository,
    private readonly replenishment: ReplenishmentApi,
    private readonly warehouse: WarehouseApi,
  ) {
    super(registry, GoodsIssuedEventType);
  }

  async handle(payload: GoodsIssuedEventPayload): Promise<void> {
    const { stocks } = await this.warehouse.getGoodStocks({
      goodIds: payload.goodIds,
      onNotFound: 'ignore',
    });

    const policies = await this.repository.findManyByGoodId(payload.goodIds);

    const requests = new LineItems<Replenishment>((r) => r.goodId);
    for (const goodId of payload.goodIds) {
      const stock = stocks.get(goodId);
      if (!stock) {
        requests.set({ goodId });
        continue;
      }
      const policy = policies.get(goodId);
      if (!policy) continue;

      if (stock.quantity <= policy.reorderPoint) requests.set({ goodId });
    }

    await this.replenishment.replenishMany({ replenishment: requests });
  }
}
