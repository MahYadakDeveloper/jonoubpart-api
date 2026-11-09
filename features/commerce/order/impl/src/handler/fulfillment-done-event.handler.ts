import {
  BaseEventHandler,
  type EventHandlerRegistry,
  type TransactionManager,
} from '@feature/shared';
import { type DeliveryApi } from '@feature/order-delivery-api';
import {
  FulfillmentDoneEventPayload,
  FulfillmentDoneEventType,
} from '@feature/order-fulfillment-api';
import { Injectable } from '@nestjs/common';
import { type OrderRepository } from '../order.repository';

@Injectable()
export class OrderFulfillmentDoneHandler extends BaseEventHandler<FulfillmentDoneEventPayload> {
  constructor(
    registry: EventHandlerRegistry,
    private readonly delivery: DeliveryApi,
    private readonly repository: OrderRepository,
    private readonly tx: TransactionManager,
  ) {
    super(registry, FulfillmentDoneEventType);
  }

  async handle({ orderId }: FulfillmentDoneEventPayload) {
    await this.tx.run(async () => {
      await this.delivery.deliver({ orderId });
      await this.repository.markAs(orderId, 'in_delivery');
    });
  }
}
