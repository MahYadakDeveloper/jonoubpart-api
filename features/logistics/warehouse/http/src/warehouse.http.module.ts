import { MovementHttpModule } from '@feature/warehouse-movement-http';
import { Module } from '@nestjs/common';
import { StockHttpModule } from '@feature/warehouse-stocks-http';

@Module({
  imports: [MovementHttpModule, StockHttpModule],
})
export class WarehouseHttpModule {}
