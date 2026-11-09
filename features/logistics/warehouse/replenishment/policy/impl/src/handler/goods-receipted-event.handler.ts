import { BaseEventHandler, type EventHandlerRegistry } from '@feature/shared';
import { type ReplenishmentApi } from '@feature/procurement-replenishment-api';
import {
  GoodsReceiptedEventPayload,
  GoodsReceiptedEventType,
  type WarehouseApi,
} from '@feature/warehouse-api';
import { Injectable } from '@nestjs/common';
import { type ReplenishmentPolicyRepository } from '../replenishment-policy.repository';

@Injectable()
export class GoodsReceiptedEventHandler extends BaseEventHandler<GoodsReceiptedEventPayload> {
  constructor(
    registry: EventHandlerRegistry,
    private readonly repository: ReplenishmentPolicyRepository,
    private readonly replenishment: ReplenishmentApi,
    private readonly warehouse: WarehouseApi,
  ) {
    super(registry, GoodsReceiptedEventType);
  }

  async handle(payload: GoodsReceiptedEventPayload): Promise<void> {
    const policies = await this.repository.findManyByGoodId(payload.goodIds);
    const { stocks } = await this.warehouse.getGoodStocks({
      goodIds: payload.goodIds,
      onNotFound: 'throw',
    });

    const requests = new Array<string>();
    for (const goodId of payload.goodIds) {
      const policy = policies.get(goodId);
      if (!policy) continue;

      const stock = stocks.getOrThrow(goodId);

      if (stock.quantity <= policy.reorderPoint) {
        requests.push(goodId);
      }
    }

    if (requests.length)
      await this.replenishment.replenishMany({
        replenishment: requests
          .map((r) => ({ goodId: r }))
          .toLineItems((r) => r.goodId),
      });

    const requestIds = new Set(requests);
    await this.replenishment.removeMany({
      goodIds: payload.goodIds.filter((goodId) => !requestIds.has(goodId)),
    });
  }
}
