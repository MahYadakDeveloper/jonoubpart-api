export const FulfillmentDoneEventType = 'fulfillment:order-fulfillment-done';
export type FulfillmentDoneEventPayload = {
  orderId: string;
};

export const FulfillmentCanceledByMerchantEventType =
  'fulfillment:order-fulfillment-canceled-by-merchant';
export type FulfillmentCanceledByMerchantEventPayload = {
  orderId: string;
};
