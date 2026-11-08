export const OrderDeliveryFailedEventType = 'delivery:order-delivery-failed';
export type OrderDeliverySucceededEventPayload = { orderId: string };

export const OrderDeliverySucceededEventType =
  'delivery:order-delivery-succeeded';
export type OrderDeliveryFailedEventPayload = { orderId: string };
