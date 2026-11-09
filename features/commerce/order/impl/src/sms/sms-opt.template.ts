import { SmsJobPayload } from '@infra/messaging-queue/job-types';

declare module '@infra/messaging-queue/job-types' {
  interface SmsTemplateRegistry {
    'delivery.out-for-delivery': {
      confirmationCode: string;
    };
  }
}

export type SmsDeliveryOutForDeliveryJobPayload =
  SmsJobPayload<'delivery.out-for-delivery'>;
