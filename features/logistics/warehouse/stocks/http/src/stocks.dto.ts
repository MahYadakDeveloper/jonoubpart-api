import {
  stockLabelRegExp,
  stocks,
} from '@infra/schema/warehouse/stocks.schema';
import { createInsertSchema } from 'drizzle-orm/zod';
import { z } from 'zod';

const code = z.regex(stockLabelRegExp);

export const labelQuerySchema = z.strictObject({
  code,
});

export const declarationSchema = createInsertSchema(stocks, {
  // Overrides with a plain zod schema; mirrors the "not blank" DB check.
  storageLocation: z.string().trim().min(1).nullish(),
  quantity: z.int().min(1),
})
  .omit({ id: true, declaredAt: true }) // server-generated
  .extend({
    barcodes: z
      .array(barcodeSchema)
      .min(1)
      .max(20)
      // (type, value) is the PK of barcodes: reject duplicates inside one request.
      .refine(
        (list) =>
          new Set(list.map((b) => `${b.type}:${b.value}`)).size === list.length,
        'Duplicate barcodes',
      ),
  });

export type LabelQuery = z.output<typeof labelQuerySchema>;
export type Declaration = z.output<typeof declarationSchema>;
