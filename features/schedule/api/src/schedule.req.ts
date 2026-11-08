import { BusinessHoursException } from './schedule.type';

export type IsOpenResponse =
  | {
      open: true;
    }
  | {
      open: false;
      reason: 'outside_hours';
    }
  | {
      open: false;
      reason: 'exception';
      exception: BusinessHoursException;
    };
