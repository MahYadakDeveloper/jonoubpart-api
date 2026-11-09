import { CheckPolicies } from '@feature/shared/decorators/check-policies.decorator';
import { AuthenticationGuard } from '@feature/shared/guards/auth.guard';
import { PoliciesGuard } from '@feature/shared/guards/policies.guard';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  type CancelFulfillmentDto,
  cancelFulfillmentSchema,
  type CompleteFulfillmentDto,
  completeFulfillmentSchema,
} from './fulfillment.dto';
import { FulfillmentService } from './fulfillment.service';
import { FulfillmentAbilityFactory } from './policies/fulfillment-ability';
import { ManageFulfillmentsPolicyHandler } from './policies/receive-returned-delivery.policy';

@UseGuards(AuthenticationGuard, PoliciesGuard)
@Controller()
export class FulfillmentController {
  constructor(private readonly fulfillments: FulfillmentService) {}

  @CheckPolicies({
    abilityFactory: FulfillmentAbilityFactory,
    handlers: [ManageFulfillmentsPolicyHandler],
  })
  @Get()
  list() {
    return this.fulfillments.list();
  }

  @CheckPolicies({
    abilityFactory: FulfillmentAbilityFactory,
    handlers: [ManageFulfillmentsPolicyHandler],
  })
  @Get(':id')
  fulfillment(@Param('id') id: string) {
    return this.fulfillments.getById(id);
  }

  @CheckPolicies({
    abilityFactory: FulfillmentAbilityFactory,
    handlers: [ManageFulfillmentsPolicyHandler],
  })
  @Post(':id/complete')
  complete(
    @Param('id') id: string,
    @Body({ schema: completeFulfillmentSchema }) dto: CompleteFulfillmentDto,
  ) {
    return this.fulfillments.complete(id, dto);
  }

  @CheckPolicies({
    abilityFactory: FulfillmentAbilityFactory,
    handlers: [ManageFulfillmentsPolicyHandler],
  })
  @Post(':id/cancel')
  cancel(
    @Param('id') id: string,
    @Body({ schema: cancelFulfillmentSchema }) dto: CancelFulfillmentDto,
  ) {
    return this.fulfillments.cancelByManager(id, dto.reason);
  }
}
