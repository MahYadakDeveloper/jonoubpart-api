import { SmsJobPayload } from '@infra/messaging-queue/job-types';

declare module '@infra/messaging-queue/job-types' {
  interface SmsTemplateRegistry {
    'delivery.pickup-request': { deliveryId: string };
  }
}

export type SmsPickupRequestJobPayload =
  SmsJobPayload<'delivery.pickup-request'>;
