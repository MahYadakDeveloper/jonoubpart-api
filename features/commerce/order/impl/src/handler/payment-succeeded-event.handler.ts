import {
  BaseEventHandler,
  type EventHandlerRegistry,
  type OutboxRepository,
  type TransactionManager,
} from '@feature/shared';
import { type FulfillmentApi } from '@feature/order-fulfillment-api';
import {
  PaymentSucceededEventPayload,
  PaymentSucceededEventType,
} from '@feature/order-payment-api';
import { Injectable } from '@nestjs/common';
import { type OrderRepository } from '../order.repository';

@Injectable()
export class PaymentSucceededEventHandler extends BaseEventHandler<PaymentSucceededEventPayload> {
  constructor(
    registry: EventHandlerRegistry,
    private readonly repository: OrderRepository,
    private readonly tx: TransactionManager,
    private readonly outbox: OutboxRepository,
    private readonly fulfillment: FulfillmentApi,
  ) {
    super(registry, PaymentSucceededEventType);
  }

  async handle(payload: PaymentSucceededEventPayload) {
    await this.tx.run(async () => {
      await this.fulfillment.fulfill({ orderId: payload.orderId });

      await this.repository.markAs(payload.orderId, 'process');
    });
  }
}
