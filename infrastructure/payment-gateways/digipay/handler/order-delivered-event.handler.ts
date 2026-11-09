import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

// Confirm Delivery
// @Injectable()
// export class OrderDeliveredEventHandler extends BaseEventHandler<OrderEventPayload> {
//   // private static readonly CONFIRMATION_PURCHASE_DELIVERY_REQUEST_ENDPOINT = 'digipay/api/purchases/deliver';

//   constructor(
//     registry: EventHandlerRegistry,
//     private readonly order: OrderApi,
//     private readonly http: HttpService,
//   ) {
//     super(registry, OrderDeliveredEventType);
//   }

//   async handle(payload: OrderEventPayload) {
//     const { order } = await this.order.findById({ orderId: payload.orderId });

//     if (order.payment.gateway !== 'digipay') return;

//     // [TODO] create req/res types for requests api

//     const body = {};
//     await firstValueFrom(
//       this.http.post(
//         '[TODO] resolve base url fro config  + PURCHASE_DELIVERED_REQUEST_ENDPOINT from config file ' +
//           '?type=0',
//         body,
//       ),
//     );
//   }
// }
