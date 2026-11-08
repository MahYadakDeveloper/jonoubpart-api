import { LogoRef } from '@feature/media-api';
import { SettingToken } from '@infra/settings-store';
import { z } from 'zod';

const deliveryMethodMetadataSchema = z.object({
  enabled: z.boolean(),
  logoRef: z.object({
    fileId: z.string(),
    fileName: z.string(),
    mimeType: z.literal('image/svg+xml'),
  }) satisfies z.ZodType<LogoRef>,
});

export const intraCityDeliveryMethodSchema = deliveryMethodMetadataSchema.and(
  z.object({
    scope: z.literal('intra-city'),
    carrier: z.literal('courier'),
    cost: z.number().int(),
    freeShippingThreshold: z.number().int().optional(),
  }),
);

export const interCityDeliveryMethodSchema = deliveryMethodMetadataSchema.and(
  z.object({
    scope: z.literal('inter-city'),
    carrier: z.object({
      key: z.string(),
      provider: z.string(),
      shippingCostPayment: z.discriminatedUnion('variant', [
        z.object({
          variant: z.literal('prepaid'),
          cost: z.number().int(),
        }),
        z.object({
          variant: z.literal('pay-on-delivery'),
        }),
      ]),
      displayName: z.string(),
      description: z.string().optional(),
      dropOffAddress: z.string(),
    }),
  }),
);

export const DeliverySettingsToken: SettingToken<
  [] | [IntraCityDeliveryMethod, ...InterCityDeliveryMethod[]]
> = {
  defaultValue: [],
  key: 'order-delivery',
  schema: z
    .tuple([intraCityDeliveryMethodSchema])
    .rest(interCityDeliveryMethodSchema)
    .refine((methods) => {
      const carriers = new Set<string>();

      for (const method of methods) {
        if (method.scope === 'intra-city') continue;

        if (carriers.has(method.carrier.key)) {
          return false;
        }

        carriers.add(method.carrier.key);
      }

      return true;
    }),
};

export type IntraCityDeliveryMethod = z.infer<
  typeof intraCityDeliveryMethodSchema
>;
export type InterCityDeliveryMethod = z.infer<
  typeof interCityDeliveryMethodSchema
>;
