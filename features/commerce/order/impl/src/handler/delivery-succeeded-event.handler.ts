import { type CashbackApi } from '@feature/cashback-api';
import {
  BaseEventHandler,
  type EventHandlerRegistry,
  type TransactionManager,
} from '@feature/shared';
import {
  OrderDeliverySucceededEventPayload,
  OrderDeliverySucceededEventType,
} from '@feature/order-delivery-api';
import { Injectable } from '@nestjs/common';
import { type OrderRepository } from '../order.repository';

@Injectable()
export class DeliverySucceededEventHandler extends BaseEventHandler<OrderDeliverySucceededEventPayload> {
  constructor(
    registry: EventHandlerRegistry,
    private readonly repository: OrderRepository,
    private readonly cashback: CashbackApi,
    private readonly tx: TransactionManager,
  ) {
    super(registry, OrderDeliverySucceededEventType);
  }

  async handle(payload: OrderDeliverySucceededEventPayload) {
    const order = await this.repository.find(payload.orderId);
    if (!order) throw new Error();
    if (order.status !== 'in_delivery') throw new Error();

    await this.tx.run(async () => {
      await this.repository.markAs(payload.orderId, 'completed');

      const { cashback: expectedCashback } = await this.cashback.calculate({
        customer: {
          id: order.customerId,
          type: order.delivery.recipient.customer.contact.type,
        },
        purchasedItems: order.items,
      });

      await this.cashback.grant({
        customer: {
          id: order.customerId,
          type: order.delivery.recipient.customer.contact.type,
        },
        expectedCashback,
        purchasedItems: order.items,
        referenceId: order.id,
      });
    });
  }
}
