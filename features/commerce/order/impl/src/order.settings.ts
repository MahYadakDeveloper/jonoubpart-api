import { z } from 'zod';

export const orderSettingsSchema = z.object({
  cancellationFee: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('fixed'),
      amount: z.number().int(),
    }),
    z.object({
      type: z.literal('rate'),
      rate: z.number().min(0).max(1),
    }),
  ]),

  expiry: z.object({
    value: z.number().positive(),
    unit: z.enum(['month', 'year', 'week', 'hour', 'minute']),
  }),
});

export const orderSettings = {
  key: 'order-settings',

  defaultValue: {
    cancellationFee: {
      type: 'fixed',
      amount: 0,
    },
    expiry: {
      value: 10,
      unit: 'minute',
    },
  },

  schema: orderSettingsSchema,
} as const;

export type OrderSettings = z.infer<typeof orderSettingsSchema>;
