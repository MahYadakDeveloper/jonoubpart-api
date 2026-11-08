import { registerAs } from '@nestjs/config';
import { z } from 'zod';

export default registerAs('delivery', () => ({
  intraCityProvinceId: z.coerce
    .number()
    .parse(process.env.INTRA_CITY_PROVINCE_ID),
  intraCityIds: z
    .string()
    .transform((val, ctx) => {
      const ids = val
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
        .map(Number);

      if (ids.some(Number.isNaN)) {
        ctx.addIssue({
          code: 'custom',
          message: 'INTRA_CITY_IDS must contain only numbers',
        });

        return z.NEVER;
      }

      return ids;
    })
    .parse(process.env.INTRA_CITY_IDS),
}));
