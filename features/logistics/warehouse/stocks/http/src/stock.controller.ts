import { PoliciesGuard } from '@feature/authorization-http/guards';
import { CheckPolicies } from '@feature/shared/decorators/check-policies.decorator';
import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Put,
    Query,
    UseGuards
} from '@nestjs/common';
import { z } from 'zod';
import { StockManagementPolicyHandler } from './policies/manage-stock.policy-handler';
import { StockAbilityFactory } from './policies/stock-ability';
import { type LabelQuery, labelQuerySchema } from './stocks.dto';

@UseGuards(PoliciesGuard)
@CheckPolicies({
  abilityFactory: StockAbilityFactory,
  handlers: [StockManagementPolicyHandler],
})
@Controller('warehouse/stock')
export class StockController {
  constructor() {}

  @Get(':id')
  get(@Param('id', { schema: z.uuid() }) stockId: string) {
    return this.stocks.getById(stockId);
  }

  @Get()
  getByLabel(@Query({ schema: labelQuerySchema }) q: LabelQuery) {}

  @Get(':id')
  getLabel(@Param('id', { schema: z.uuid() }) id: string): { code: string } {
  }

  @Post()
  declare(/** NOTE: ADD OPTIONAL STOCK FIELDS SCHEMA */): { code: string } {
    return this.stocks.define(definition);
  }

  @Put(':id')
  setStorageLocation(
    @Body({ schema: ... })
  ) {
  }

}
