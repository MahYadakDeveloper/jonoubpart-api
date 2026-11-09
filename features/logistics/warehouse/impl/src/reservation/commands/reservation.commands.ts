import { type ApiCommand, ApiCommands } from '@feature/shared/cqrs';
import { ReservationApi } from '@feature/warehouse-api/reservation';
import { Inject, Injectable } from '@nestjs/common';
import { ReleaseApiCommand } from './release.cmd';
import { ReserveApiCommand } from './reserve.cmd';

@Injectable()
export class ReservationApiCommands implements ApiCommands<ReservationApi> {
  @Inject(ReleaseApiCommand)
  release: ApiCommand<ReservationApi, 'release'>;
  @Inject(ReserveApiCommand)
  reserve: ApiCommand<ReservationApi, 'reserve'>;
}
