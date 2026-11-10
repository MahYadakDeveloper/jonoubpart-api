import { z } from 'zod';

export const phone = z
  .string()
  .trim()
  .regex(/^09\d{9}$/, 'phone number must be in Iranian local format (09…)');
