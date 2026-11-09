import { defineEvent } from '@feature/shared/contracts/outbox-event';
import { z } from 'zod';

export const fulfilledEvent = defineEvent(
  'fulfillment.fulfilled',
  z.object({ orderId: z.uuid() }),
);

export const canceledByManagerEvent = defineEvent(
  'fulfillment.canceled_by_manager',
  z.object({ orderId: z.uuid() }),
);
