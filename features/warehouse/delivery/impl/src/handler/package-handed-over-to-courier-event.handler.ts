import { BaseEventHandler, type EventHandlerRegistry } from '@feature/shared';
import {
  PackageHandedOverToCourierEventPayload,
  PackageHandedOverToCourierEventType,
} from '@feature/order-delivery-courier-api';
import { Injectable } from '@nestjs/common';
import { type DeliveryRepository } from '../delivery.repository';

@Injectable()
export class PackageHandedOverToCourierEventHandler extends BaseEventHandler<PackageHandedOverToCourierEventPayload> {
  constructor(
    registry: EventHandlerRegistry,
    private readonly repository: DeliveryRepository,
  ) {
    super(registry, PackageHandedOverToCourierEventType);
  }

  async handle(payload: PackageHandedOverToCourierEventPayload) {
    const delivery = await this.repository.findById(payload.deliveryId);
    if (payload.scope === 'intra_city') {
      if (delivery.recipient.scope !== payload.scope) throw new Error();
      await this.repository.markAsHandedOverToCourier(payload.deliveryId, {
        courierId: payload.courierId,
        recipient: {
          ...delivery.recipient,
          deliveryConfirmationCode: payload.deliveryConfirmationCode,
        },
        handedOverAt: new Date(),
      });
    } else {
      if (delivery.recipient.scope !== payload.scope) throw new Error();
      await this.repository.markAsHandedOverToCourier(payload.deliveryId, {
        courierId: payload.courierId,
        handedOverAt: new Date(),
        status: 'handed_over_to_courier',
        recipient: {
          ...delivery.recipient,
        },
      });
    }
  }
}
