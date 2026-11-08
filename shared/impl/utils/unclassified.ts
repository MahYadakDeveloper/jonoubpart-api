import { sql, SQL } from 'drizzle-orm';

import { Duration } from '../types/_';

export function subtractDuration(date: Date, duration: Duration): Date {
  const result = new Date(date);

  switch (duration.unit) {
    case 'minute':
      result.setMinutes(result.getMinutes() - duration.value);
      break;

    case 'hour':
      result.setHours(result.getHours() - duration.value);
      break;

    case 'week':
      result.setDate(result.getDate() - duration.value * 7);
      break;

    case 'month':
      result.setMonth(result.getMonth() - duration.value);
      break;

    case 'year':
      result.setFullYear(result.getFullYear() - duration.value);
      break;
  }

  return result;
}

export function addDuration(date: Date, duration: Duration): Date {
  const result = new Date(date);

  switch (duration.unit) {
    case 'minute':
      result.setMinutes(result.getMinutes() + duration.value);
      break;

    case 'hour':
      result.setHours(result.getHours() + duration.value);
      break;

    case 'week':
      result.setDate(result.getDate() + duration.value * 7);
      break;

    case 'month':
      result.setMonth(result.getMonth() + duration.value);
      break;

    case 'year':
      result.setFullYear(result.getFullYear() + duration.value);
      break;
  }

  return result;
}

export function omit<T extends object, K extends keyof T>(
  obj: T,
  keys: readonly K[],
): Omit<T, K> {
  const copy = { ...obj };
  for (const key of keys) delete copy[key];
  return copy;
}
