import { defineEvent } from '@feature/shared/contracts/outbox-event';
import { z } from 'zod';

export const deliveredEvent = defineEvent(
  'delivery.delivered',
  z.object({ orderId: z.uuid() }),
);
