import { type SettingsStore, SettingToken } from '@feature/shared';
import {
  BusinessHoursException,
  IsOpenResponse,
  ScheduleApi,
} from '@feature/schedule-api';
import { Injectable } from '@nestjs/common';
import { businessHoursSchema, BusinessHoursType } from './schedule.schema';
import { isTimeGreaterThanOrEqualTo, isTimeInInterval } from './utils';

@Injectable()
export class ScheduleService implements ScheduleApi {
  private static readonly scheduleSettings: SettingToken<BusinessHoursType> = {
    defaultValue: {
      timezone: 'Asia/Tehran',
      weeklySchedule: [
        {
          weekday: 'saturday',
          open: true,
          intervals: [
            { opensAt: '08:00', closesAt: '13:00' },
            { opensAt: '17:00', closesAt: '21:00' },
          ],
        },
        {
          weekday: 'sunday',
          open: true,
          intervals: [
            { opensAt: '08:00', closesAt: '13:00' },
            { opensAt: '17:00', closesAt: '21:00' },
          ],
        },
        {
          weekday: 'monday',
          open: true,
          intervals: [
            { opensAt: '08:00', closesAt: '13:00' },
            { opensAt: '17:00', closesAt: '21:00' },
          ],
        },
        {
          weekday: 'tuesday',
          open: true,
          intervals: [
            { opensAt: '08:00', closesAt: '13:00' },
            { opensAt: '17:00', closesAt: '21:00' },
          ],
        },
        {
          weekday: 'wednesday',
          open: true,
          intervals: [
            { opensAt: '08:00', closesAt: '13:00' },
            { opensAt: '17:00', closesAt: '21:00' },
          ],
        },
        {
          weekday: 'thursday',
          open: true,
          intervals: [
            { opensAt: '08:00', closesAt: '13:00' },
            { opensAt: '17:00', closesAt: '21:00' },
          ],
        },
        {
          weekday: 'friday',
          open: false,
          intervals: [],
        },
      ],
      exceptions: [],
    },
    key: 'schedule-settings',
    schema: businessHoursSchema,
  };

  constructor(private readonly settings: SettingsStore) {}

  getBusinessHours(): Promise<BusinessHoursType> {
    return this.settings.get(ScheduleService.scheduleSettings);
  }
  setBusinessHours({ data }: { data: BusinessHoursType }): Promise<void> {
    return this.settings.set(ScheduleService.scheduleSettings, data);
  }

  async isOpenNow(): Promise<IsOpenResponse> {
    const businessHours = await this.settings.get(
      ScheduleService.scheduleSettings,
    );
    const now = new Date();
    const weekdayIndex = now.getDay();
    const weekday = businessHours.weeklySchedule[weekdayIndex];

    // Keep a reference to see if we need to purge expired records later
    let exceptionsChanged = false;
    const activeExceptions: BusinessHoursException[] = [];

    for (const e of businessHours.exceptions) {
      // Standardize comparison to cover the full duration of the end date
      const startTime = new Date(e.date.start).getTime();
      const endTime = new Date(e.date.end).setHours(23, 59, 59, 999);
      const currentTime = now.getTime();

      if (currentTime >= startTime && currentTime <= endTime) {
        return {
          open: false,
          reason: 'exception',
          exception: e,
        };
      }

      // Keep active exceptions, mark expired ones for later removal
      if (currentTime <= endTime) {
        activeExceptions.push(e);
      } else {
        exceptionsChanged = true;
      }
    }

    if (exceptionsChanged) {
      await this.settings.set(ScheduleService.scheduleSettings, {
        ...businessHours,
        exceptions: activeExceptions,
      });
    }

    if (!weekday.open) {
      return {
        open: false,
        reason: 'outside_hours',
      };
    }

    for (const interval of weekday.intervals) {
      // padStart ensures hours and minutes are always two digits (HH:mm)
      const timeNow = this.formatDateToDayTime(now);

      if (isTimeInInterval(timeNow, interval.opensAt, interval.closesAt))
        return {
          open: true,
        };
    }

    return {
      open: false,
      reason: 'outside_hours',
    };
  }

  async getNextBusinessHours() {
    const businessHours = await this.settings.get(
      ScheduleService.scheduleSettings,
    );

    const exceptions = (businessHours.exceptions ?? [])
      .map((exception) => {
        const start = new Date(exception.date.start);
        const end = new Date(exception.date.end);

        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
          return null;
        }

        // Exceptions are considered full-day closures.
        end.setHours(23, 59, 59, 999);

        return {
          start: start.getTime(),
          end: end.getTime(),
        };
      })
      .filter(
        (exception): exception is { start: number; end: number } =>
          exception !== null,
      );

    const currentAnchor = new Date();

    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const candidateDate = new Date(currentAnchor);

      candidateDate.setDate(candidateDate.getDate() + dayOffset);

      if (dayOffset > 0) {
        candidateDate.setHours(0, 0, 0, 0);
      }

      const weekday = businessHours.weeklySchedule?.[candidateDate.getDay()];

      if (!weekday?.open) {
        continue;
      }

      const currentDayTime = this.formatDateToDayTime(candidateDate);

      for (const interval of weekday.intervals ?? []) {
        if (!isTimeGreaterThanOrEqualTo(interval.opensAt, currentDayTime)) {
          continue;
        }

        const [hours, minutes] = interval.opensAt.split(':').map(Number);

        const proposedOpenDate = new Date(candidateDate);

        proposedOpenDate.setHours(hours, minutes, 0, 0);

        const proposedOpenTimestamp = proposedOpenDate.getTime();

        const isBlocked = exceptions.some(
          (exception) =>
            proposedOpenTimestamp >= exception.start &&
            proposedOpenTimestamp <= exception.end,
        );

        if (isBlocked) {
          continue;
        }

        return {
          opensAt: proposedOpenDate,
        };
      }
    }

    return undefined;
  }

  /**
   * padStart ensures hours and minutes are always two digits (HH:mm)
   */
  private formatDateToDayTime(date: Date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
}
