import { createPageQuerySchema } from '@feature/shared/utils/pagination';
import { barcodeType, unitOfMeasure } from '@infra/db-drizzle/schema';
import { z } from 'zod';
import { stockSortableFields } from './stock.repository';
import { StockService } from './stock.service';

export const StockPageQuerySchema = createPageQuerySchema(stockSortableFields, [
  '-definedAt',
  '-id',
]);

type DefineStockInput = Parameters<StockService['define']>[0];

export const StockDefinitionSchema = z.object({
  barcode: z.object({
    type: z.enum(barcodeType.enumValues),
    value: z.string().min(1),
  }),
  unitOfMeasure: z.enum(unitOfMeasure.enumValues),
  storageLocation: z.string().nullable().default(null),
}) satisfies z.ZodType<DefineStockInput>;

export const StockAdjustmentSchema = z.object({
  direction: z.union([z.literal('inbound'), z.literal('outbound')]),
  idempotencyKey: z.uuid(),
  quantity: z.coerce.number().int(),
  source: z.object({
    type: z.literal('adjustment'),
    reason: z.string().optional(),
  }),
});

export interface StockAdjustmentDto extends z.infer<
  typeof StockAdjustmentSchema
> {}
export interface StockPageQueryDto extends z.infer<
  typeof StockPageQuerySchema
> {}
export interface StockDefinitionDto extends z.infer<
  typeof StockDefinitionSchema
> {}
