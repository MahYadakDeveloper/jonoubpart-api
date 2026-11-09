import {
  STOCK_MOVEMENT_API,
  STOCK_QUERY_API,
  STOCK_RESERVATION_API,
} from '@feature/warehouse-api';
import { DrizzleDbModule } from '@infra/db-drizzle';
import { DrizzleOutboxModule } from '@infra/messaging-outbox';
import { DynamicModule, Module, ModuleMetadata } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { StockMovementRepository } from './movement/movement.repository';
import { StockMovementService } from './movement/movement.repository';
import { StockQuarantineController } from './quarantine/quarantine.controller';
import { StockQuarantineRepository } from './quarantine/quarantine.repository';
import { StockQuarantineService } from './quarantine/quarantine.service';
import { StockReservationApiImpl } from './reservation/reservation.api';
import { StockReservationRepository } from './reservation/reservation.repository';
import { StockController } from './stock/stock.controller';
import { StockRepository } from './stock/stock.repository';
import { StockService } from './stock/stock.service';

@Module({
  imports: [DrizzleDbModule, DrizzleOutboxModule],
  providers: [
    { provide: AsyncLocalStorage, useValue: new AsyncLocalStorage() },
    // StockAbilityFactory,
    // StockManagementPolicyHandler,
    // QuarantineAbilityFactory,
    // QuarantineManagePolicyHandler,
    StockRepository,
    StockMovementRepository,
    StockQuarantineRepository,
    StockReservationRepository,

    StockService,
    StockQuarantineService,
    StockMovementService,
    StockReservationApiImpl,
    {
      provide: STOCK_MOVEMENT_API,
      useExisting: StockMovementService,
    },
    {
      provide: STOCK_QUERY_API,
      useExisting: StockService,
    },
    {
      provide: STOCK_RESERVATION_API,
      useExisting: StockReservationApiImpl,
    },
  ],
  controllers: [StockController, StockQuarantineController],
  exports: [STOCK_MOVEMENT_API, STOCK_QUERY_API, STOCK_RESERVATION_API],
})
export class WarehouseModule {
  static forRoot(options: ModuleMetadata): DynamicModule {
    return {
      module: WarehouseModule,
      ...options,
    };
  }
}
