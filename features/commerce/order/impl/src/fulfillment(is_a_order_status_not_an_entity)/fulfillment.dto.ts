import { z } from 'zod';
import { FulfillmentService } from './fulfillment.service';

export const completeFulfillmentSchema = z.toZod<
  Parameters<FulfillmentService['complete']>[1]
>()(
  z.array(
    z.strictObject({
      stockId: z.uuid(),
      quantity: z.number().int(),
    }),
  ),
);

export const cancelFulfillmentSchema = z.strictObject({
  reason: z.string().max(500),
});

export type CompleteFulfillmentDto = z.infer<typeof completeFulfillmentSchema>;
export type CancelFulfillmentDto = z.infer<typeof cancelFulfillmentSchema>;
