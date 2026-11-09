import { intraCityDeliveryFailureReasons } from '@infra/db-drizzle/schema';
import { z } from 'zod';

const InterCityDeliveryFailureReasonsSchema = z.enum(
  intraCityDeliveryFailureReasons.enumValues,
);

export const deliveryAttemptReportSchema = z.discriminatedUnion('scope', [
  z.strictObject({
    scope: z.literal('intra_city'),
    report: z.discriminatedUnion('outcome', [
      z.strictObject({
        outcome: z.literal('delivered'),
        confirmationCode: z
          .string()
          .trim()
          .regex(/^\d{6}$/, 'Code must be exactly 6 digits'),
      }),

      ...z
        .discriminatedUnion('reason', [
          z.strictObject({
            reason: InterCityDeliveryFailureReasonsSchema.exclude(['other']),
          }),
          z.strictObject({
            reason: z.literal('other'),
            reasonMessage: z.string().max(500),
          }),
        ])
        .options.map((schema) =>
          schema.extend({ outcome: z.literal('failed') }),
        ),
    ]),
  }),

  z.strictObject({
    scope: z.literal('inter_city'),
    report: z.discriminatedUnion('outcome', [
      z.strictObject({
        outcome: z.literal('delivered'),
        trackingCode: z.string().max(32),
      }),
      z.strictObject({
        outcome: z.literal('failed'),
        reasonMessage: z.string().max(500),
      }),
    ]),
  }),
]);

export type InterCityDeliveryFailureReasons =
  (typeof intraCityDeliveryFailureReasons.enumValues)[number];

export type DeliveryAttemptReportDto = z.infer<
  typeof deliveryAttemptReportSchema
>;
