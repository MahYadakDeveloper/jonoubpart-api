export type Weekday =
  | 'saturday'
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday';

export type BusinessHoursInterval = {
  opensAt: string;
  closesAt: string;
};

export type WeeklyBusinessDay =
  | {
      weekday: Weekday;
      open: false;
    }
  | {
      weekday: Weekday;
      open: true;
      intervals: BusinessHoursInterval[];
    };

export type BusinessHoursException = {
  date: { start: Date; end: Date };
  type: 'closed';
  reason?: string;
};

export type BusinessHours = {
  timezone: string;
  weeklySchedule: WeeklyBusinessDay[];
  exceptions: BusinessHoursException[];
};
