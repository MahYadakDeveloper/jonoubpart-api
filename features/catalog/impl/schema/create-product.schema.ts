import { z } from 'zod';

export const createProductSchema = z.object({});

export type CreateProduct = z.infer<typeof createProductSchema>;
