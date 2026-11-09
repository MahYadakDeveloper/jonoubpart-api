import { z } from 'zod';

export const payoutRequestSchema = z.strictObject({
  amount: z.number().int().min(100_000), // toman
});

export interface PayoutRequestDto extends z.infer<typeof payoutRequestSchema> {}
