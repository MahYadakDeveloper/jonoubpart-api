export const timeToMinutes = (timeStr: string): number => {
  const [hours, minutes] = timeStr.split(':').map(Number);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error(`Invalid time format: ${timeStr}`);
  }

  return hours * 60 + minutes;
};
/**
 * Checks if a given time is between an opening and closing time boundary.
 * Inclusive of the starting time, exclusive of the ending time.
 */
export const isTimeInInterval = (
  timeNow: string,
  opensAt: string,
  closesAt: string,
): boolean => {
  const current = timeToMinutes(timeNow);
  const start = timeToMinutes(opensAt);
  const end = timeToMinutes(closesAt);

  return current >= start && current < end;
};

export const isTimeGreaterThanOrEqualTo = (
  source: string,
  other: string,
): boolean => {
  const _source = timeToMinutes(source);
  const _other = timeToMinutes(other);

  return _source >= _other;
};
