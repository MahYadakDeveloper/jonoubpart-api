import { discriminatedVariants } from '@feature/shared/utils/zod';
import {
  adjustmentEffect,
  adjustmentReason,
  adjustments,
} from '@infra/schema/warehouse/adjustments.schema';
import { createInsertSchema } from 'drizzle-orm/zod';
import { z } from 'zod';

const effect = z.enum(adjustmentEffect.enumValues);
const reason = z.enum(adjustmentReason.enumValues);
const note = z.string().min(1).nullish();

const base = createInsertSchema(adjustments).omit({
  id: true,
  adjustedAt: true,

  managerId: true,

  effect: true,
  reason: true,
  note: true,
});

const { variant, build } = discriminatedVariants(base, 'reason', reason, {
  note,
});

const shortage = { effect: z.literal('shortage') };
const surplus = { effect: z.literal('surplus') };

export const adjustDtoSchema = build([
  variant('lost', shortage),
  variant('damaged', shortage),
  variant('found', surplus),
  variant('count_correction', { effect }),
  variant('other', { effect, note: z.string().min(1) }),
]);

export type AdjustDto = z.infer<typeof adjustDtoSchema>;
