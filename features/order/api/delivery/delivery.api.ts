import { Delivery, Recipient } from './delivery.type';

export interface DeliveryApi {
  create(req: { orderId: string; recipient: Recipient }): Promise<void>;
  findById(req: { deliveryId: string }): Promise<{ delivery: Delivery }>;
  deliver(req: { orderId: string }): Promise<void>;
  cancelDelivery(req: { orderId: string }): Promise<void>;
}
