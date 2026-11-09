import {
  BaseEventHandler,
  type EventHandlerRegistry,
  type OutboxRepository,
  type TransactionManager,
} from '@feature/shared';
import {
  OrderDeliveryFailedEventPayload,
  OrderDeliveryFailedEventType,
} from '@feature/order-delivery-api';
import {
  DeliveryFailedEventPayload,
  DeliveryFailedEventType,
} from '@feature/order-delivery-courier-api';
import { Injectable } from '@nestjs/common';
import { type DeliveryRepository } from '../delivery.repository';

@Injectable()
export class DeliveryFailedEventHandler extends BaseEventHandler<DeliveryFailedEventPayload> {
  constructor(
    registry: EventHandlerRegistry,
    readonly repository: DeliveryRepository,
    private readonly outbox: OutboxRepository,
    private readonly tx: TransactionManager,
  ) {
    super(registry, DeliveryFailedEventType);
  }

  async handle(payload: DeliveryFailedEventPayload) {
    const delivery = await this.repository.findById(payload.deliveryId);
    await this.tx.run(async () => {
      if (payload.scope === 'inter_city') {
        if (delivery.recipient.scope !== 'inter_city') throw new Error();
        if (delivery.status !== 'handed_over_to_courier') throw new Error();
        await this.repository.markAsReturnedToWarehouse(payload.deliveryId, {
          returnedAt: new Date(),
          status: 'returned_to_warehouse',
          recipient: {
            ...delivery.recipient,
            reasonMessage: payload.reasonMessage,
          },
        });
      } else {
        if (delivery.recipient.scope !== payload.scope) throw new Error();
        if (delivery.status !== 'handed_over_to_courier') throw new Error();
        await this.repository.markAsReturnedToWarehouse(payload.deliveryId, {
          returnedAt: new Date(),
          status: 'returned_to_warehouse',
          recipient: {
            ...delivery.recipient,
            ...payload,
          },
        });
      }

      await this.outbox.save({
        type: OrderDeliveryFailedEventType,
        payload: {
          orderId: delivery.orderId,
        } satisfies OrderDeliveryFailedEventPayload,
      });
    });
  }
}
