import { CurrentUser } from '@feature/authentication-http/decorators';
import { CheckPolicies } from '@feature/authorization-http/decorators';
import { PoliciesGuard } from '@feature/authorization-http/guards';
import { ProblemResponses } from '@feature/error-http/decorators';
import { Body, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdjustCommand } from './commands/adjust.command';
import { type AdjustDto, adjustDtoSchema } from './dto/adjust.dto';
import { type ListQueryDto, listQuerySchema } from './dto/list-query.dto';
import { MovementAbilityFactor } from './policies/movement-ability.factory';
import { MovementManagementPolicy } from './policies/movement-management-policy.handler';
import { ListQuery } from './queries/list.query';
import { NonPositiveQuantityError } from '@feature/warehouse-errors/movement.errors';
import type { UserOf } from '@feature/authentication-http';
import { StockNotFoundError } from '@feature/warehouse-errors/stocks.error';

@UseGuards(PoliciesGuard)
@CheckPolicies({
  abilityFactory: MovementAbilityFactor,
  handlers: [MovementManagementPolicy],
})
@Controller('warehouse/movement')
export class MovementController {
  constructor(
    private readonly listQuery: ListQuery,
    private readonly adjustCmd: AdjustCommand,
  ) {}

  @ProblemResponses()
  @Get()
  list(@Query({ schema: listQuerySchema }) q: ListQueryDto) {
    return this.listQuery.execute(q);
  }

  @ProblemResponses(StockNotFoundError, NonPositiveQuantityError)
  adjust(
    @Body({ schema: adjustDtoSchema }) dto: AdjustDto,
    @CurrentUser() manager: UserOf<'manager'>,
  ) {
    return this.adjustCmd.execute({ ...dto, managerId: manager.id });
  }
}
