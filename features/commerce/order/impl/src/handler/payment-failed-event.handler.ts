import {
  BaseEventHandler,
  type EventHandlerRegistry,
  type TransactionManager,
} from '@feature/shared';
import { type DeliveryApi } from '@feature/order-delivery-api';
import { type FulfillmentApi } from '@feature/order-fulfillment-api';
import {
  PaymentFailedEventPayload,
  PaymentFailedEventType,
} from '@feature/order-payment-api';
import { Injectable } from '@nestjs/common';
import { type OrderRepository } from '../order.repository';

@Injectable()
export class PaymentFailedEventHandler extends BaseEventHandler<PaymentFailedEventPayload> {
  constructor(
    registry: EventHandlerRegistry,
    private readonly repository: OrderRepository,
    private readonly delivery: DeliveryApi,
    private readonly fulfillment: FulfillmentApi,
    private readonly tx: TransactionManager,
  ) {
    super(registry, PaymentFailedEventType);
  }

  async handle(payload: PaymentFailedEventPayload) {
    await this.tx.run(async () => {
      await this.repository.markAs(payload.orderId, 'unsuccessful_pay');
      await this.delivery.cancelDelivery({ orderId: payload.orderId });
      await this.fulfillment.cancel({ orderId: payload.orderId });
    });
  }
}
