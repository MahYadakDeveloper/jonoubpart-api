import { z } from 'zod';

export const WalletUsageSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('full') }),
  z.strictObject({
    mode: z.literal('partial'),
    amount: z.number().int().positive(),
  }),
]);

export const PaymentMethodSelectionSchema = z.discriminatedUnion('method', [
  z.strictObject({ method: z.literal('wallet') }),
  z.strictObject({ method: z.literal('gateway'), gatewayKey: z.string() }),
  z.strictObject({
    method: z.literal('partial'),
    gatewayKey: z.string(),
    walletUsage: WalletUsageSchema,
  }),
]);

// paymentId comes from the path and customerId from the session, never the body
export const SettlementRequestSchema = PaymentMethodSelectionSchema;

export type WalletUsage = z.infer<typeof WalletUsageSchema>;
export type PaymentMethodSelection = z.infer<
  typeof PaymentMethodSelectionSchema
>;

// --------- dto -----------
