import { CheckPolicies } from '@feature/shared/decorators/check-policies.decorator';
import { AuthenticationGuard } from '@feature/shared/guards/auth.guard';
import { PoliciesGuard } from '@feature/shared/guards/policies.guard';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  type PaymentMethodSelection,
  SettlementRequestSchema,
} from './payment.schema';
import { PaymentService } from './payment.service';
import { CancellationPolicyHandler } from './policy/cancellation.policy-handler';
import { PaymentAbilityFactory } from './policy/payment-ability';
import { SettlementPolicyHandler } from './policy/settlement.policy-handler';

@UseGuards(AuthenticationGuard, PoliciesGuard)
@Controller('orders/payment')
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @CheckPolicies({
    abilityFactory: PaymentAbilityFactory,
    handlers: [SettlementPolicyHandler],
  })
  @Post('settle/:id')
  settle(
    @Param('id', { schema: z.coerce.number().int().positive() })
    paymentId: number,
    @Body({ schema: SettlementRequestSchema })
    selection: PaymentMethodSelection,
  ) {
    return this.payments.settle(paymentId, selection);
  }

  @CheckPolicies({
    abilityFactory: PaymentAbilityFactory,
    handlers: [CancellationPolicyHandler],
  })
  @Get('cancel/:id')
  cancel(
    @Param('id', { schema: z.coerce.number().int().positive() })
    paymentId: number,
  ) {
    return this.payments.cancel(paymentId);
  }
}
