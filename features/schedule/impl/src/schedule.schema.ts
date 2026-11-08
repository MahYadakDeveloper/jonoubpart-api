import {
  BusinessHoursException,
  BusinessHoursInterval,
  Weekday,
} from '@feature/schedule-api';
import { z } from 'zod';
import { timeToMinutes } from './utils';

const weekdaySchema: z.ZodType<Weekday> = z.union([
  z.literal('saturday'),
  z.literal('sunday'),
  z.literal('monday'),
  z.literal('tuesday'),
  z.literal('wednesday'),
  z.literal('thursday'),
  z.literal('friday'),
]);

const timeStringRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

export const hourOfDaySchema = z
  .string()
  .regex(timeStringRegex, { message: 'Must be a valid time in HH:mm format' });

const businessHoursIntervalSchema: z.ZodType<BusinessHoursInterval> = z
  .object({
    opensAt: hourOfDaySchema,
    closesAt: hourOfDaySchema,
  })
  .refine(
    (data) => {
      // If either field failed its initial regex validation, skip this check
      if (
        !timeStringRegex.test(data.opensAt) ||
        !timeStringRegex.test(data.closesAt)
      ) {
        return true;
      }
      return timeToMinutes(data.closesAt) > timeToMinutes(data.opensAt);
    },
    {
      message: 'Closing time must be after opening time',
      path: ['closesAt'], // This attaches the error specifically to the closesAt field
    },
  );

const baseWeeklyBusinessDaySchema = z.object({
  open: z.boolean(),
  weekday: weekdaySchema,
  intervals: z.array(businessHoursIntervalSchema),
});

const weeklyScheduleTuple = z.tuple([
  baseWeeklyBusinessDaySchema.extend({ weekday: z.literal('saturday') }),
  baseWeeklyBusinessDaySchema.extend({ weekday: z.literal('sunday') }),
  baseWeeklyBusinessDaySchema.extend({ weekday: z.literal('monday') }),
  baseWeeklyBusinessDaySchema.extend({ weekday: z.literal('tuesday') }),
  baseWeeklyBusinessDaySchema.extend({ weekday: z.literal('wednesday') }),
  baseWeeklyBusinessDaySchema.extend({ weekday: z.literal('thursday') }),
  baseWeeklyBusinessDaySchema.extend({ weekday: z.literal('friday') }),
]);

const businessHoursExceptionSchema: z.ZodType<BusinessHoursException> =
  z.object({
    date: z.object({
      start: z.date(),
      end: z.date(),
    }),
    type: z.literal('closed'),
    reason: z.string(),
  });

export const businessHoursSchema = z.object({
  timezone: z.string().refine(
    (val) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: val });
        return true;
      } catch (e) {
        return false;
      }
    },
    { message: 'Invalid IANA timezone string' },
  ),
  weeklySchedule: weeklyScheduleTuple,
  exceptions: z.array(businessHoursExceptionSchema),
});

export type BusinessHoursType = z.infer<typeof businessHoursSchema>;
