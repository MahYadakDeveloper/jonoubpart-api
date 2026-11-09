import {
  BaseEventHandler,
  Money,
  type EventHandlerRegistry,
  type TransactionManager,
} from '@feature/shared';
import {
  OrderDeliveryFailedEventPayload,
  OrderDeliveryFailedEventType,
  OrderDeliverySucceededEventPayload,
} from '@feature/order-delivery-api';
import { type PaymentApi } from '@feature/order-payment-api';
import { Injectable } from '@nestjs/common';
import { type OrderRepository } from '../order.repository';

@Injectable()
export class DeliveryFailedEventHandler extends BaseEventHandler<OrderDeliverySucceededEventPayload> {
  constructor(
    registry: EventHandlerRegistry,
    private readonly repository: OrderRepository,
    private readonly payment: PaymentApi,
    private readonly tx: TransactionManager,
  ) {
    super(registry, OrderDeliveryFailedEventType);
  }

  async handle(payload: OrderDeliveryFailedEventPayload) {
    const order = await this.repository.find(payload.orderId);
    if (!order) throw new Error();

    const fee = order.cancellationTerms.fee;
    let refund = Money.zero();
    if (fee.type === 'fixed')
      refund = order.summary.grandTotal.subtract(
        Money.create(fee.amount.value),
      );
    else {
      refund = order.summary.grandTotal.subtract(
        order.summary.grandTotal.multiply(fee.rate),
      );
    }

    await this.tx.run(async () => {
      await this.payment.refund({
        type: 'partial',
        sessionId: order.payment.sessionId,
        amount: refund,
        customerId: order.customerId,
      });

      await this.repository.markAs(payload.orderId, 'returned_to_warehouse');
    });
  }
}
