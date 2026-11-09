import { CheckPolicies } from '@feature/shared/decorators/check-policies.decorator';
import { User } from '@feature/shared/decorators/user.decorator';
import { AuthenticationGuard } from '@feature/shared/guards/auth.guard';
import { PoliciesGuard } from '@feature/shared/guards/policies.guard';
import { type AuthenticatedUser } from '@feature/shared/types/authenticated-user';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  deliveryAttemptReportSchema,
  type DeliveryAttemptReportDto,
} from './delivery.dto';
import { DeliveryService } from './delivery.service';
import { ConfirmPickupPolicyHandler } from './policies/confirm-pickup.policy';
import { DeliveryAbilityFactory } from './policies/delivery-ability';
import { ReceiveReturnedDeliveryPolicyHandler } from './policies/receive-returned-delivery.policy';
import { ReportDeliveryAttemptPolicyHandler } from './policies/report-delivery-attempt.policy';

@UseGuards(AuthenticationGuard, PoliciesGuard)
@Controller()
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}
  @Get()
  findAll() {
    return this.delivery.findAll();
  }

  @CheckPolicies({
    abilityFactory: DeliveryAbilityFactory,
    handlers: [ConfirmPickupPolicyHandler],
  })
  @Post(':id/confirm-pickup')
  confirmPickup(
    @Param('id', { schema: z.uuid() }) id: string,
    @User() user: AuthenticatedUser,
  ) {
    return this.delivery.confirmPickup(
      id,
      (user as Extract<AuthenticatedUser, { role: 'courier' }>).id,
    );
  }

  @CheckPolicies({
    abilityFactory: DeliveryAbilityFactory,
    handlers: [ReportDeliveryAttemptPolicyHandler],
  })
  @Post(':id/attempts')
  reportDeliveryAttempt(
    @Param('id', { schema: z.uuid() }) id: string,
    @Body({ schema: deliveryAttemptReportSchema })
    dto: DeliveryAttemptReportDto,
  ) {
    return this.delivery.reportDeliveryAttempt(id, dto);
  }

  @CheckPolicies({
    abilityFactory: DeliveryAbilityFactory,
    handlers: [ReceiveReturnedDeliveryPolicyHandler],
  })
  @Post(':id/receive-return')
  receiveReturnedDelivery(@Param('id', { schema: z.uuid() }) id: string) {
    return this.delivery.receiveReturnedDelivery(id);
  }
}
