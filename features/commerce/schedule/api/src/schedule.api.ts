import { IsOpenResponse } from './schedule.req';

export interface ScheduleApi {
  isOpenNow(): Promise<IsOpenResponse>;
}
