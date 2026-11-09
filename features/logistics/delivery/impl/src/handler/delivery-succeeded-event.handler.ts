import {
  BaseEventHandler,
  type EventHandlerRegistry,
  type OutboxRepository,
  type TransactionManager,
} from '@feature/shared';
import {
  OrderDeliverySucceededEventPayload,
  OrderDeliverySucceededEventType,
} from '@feature/order-delivery-api';
import {
  DeliverySucceededEventPayload,
  DeliverySucceededEventType,
} from '@feature/order-delivery-courier-api';
import { Injectable } from '@nestjs/common';
import { type DeliveryRepository } from '../delivery.repository';

@Injectable()
export class DeliverySucceededEventHandler extends BaseEventHandler<DeliverySucceededEventPayload> {
  constructor(
    registry: EventHandlerRegistry,
    private readonly repository: DeliveryRepository,
    private readonly outbox: OutboxRepository,
    private readonly tx: TransactionManager,
  ) {
    super(registry, DeliverySucceededEventType);
  }

  async handle(payload: DeliverySucceededEventPayload) {
    const delivery = await this.repository.findById(payload.deliveryId);
    await this.tx.run(async () => {
      if (payload.scope === 'intra_city') {
        if (delivery.recipient.scope !== payload.scope) throw new Error();
        if (delivery.status !== 'handed_over_to_courier') throw new Error();
        await this.repository.markAsDelivered(payload.deliveryId, {
          deliveredAt: new Date(),
          recipient: {
            ...delivery.recipient,
          },
        });
      } else {
        if (delivery.recipient.scope !== payload.scope) throw new Error();
        if (delivery.status !== 'handed_over_to_courier') throw new Error();
        await this.repository.markAsDelivered(payload.deliveryId, {
          deliveredAt: new Date(),
          recipient: {
            ...delivery.recipient,
            trackingNumber: payload.trackingNumber,
          },
        });
      }

      await this.outbox.save({
        type: OrderDeliverySucceededEventType,
        payload: {
          orderId: delivery.orderId,
        } satisfies OrderDeliverySucceededEventPayload,
      });
    });
  }
}
