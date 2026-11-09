import { PolicyContext } from '@feature/shared/contracts/policy-context';
import { PolicyHandler } from '@feature/shared/contracts/policy-handler';
import { NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { PaymentService } from '../payment.service';
import { PaymentAbility } from './payment-ability';

export class CancellationPolicyHandler implements PolicyHandler<PaymentAbility> {
  constructor(private readonly payments: PaymentService) {}

  async handle(
    ability: PaymentAbility,
    context: PolicyContext,
  ): Promise<boolean> {
    const id = z.coerce.number().int().positive().parse(context.params.id);

    const customerId = await this.payments.findOwnerId(id);
    // Same answer for missing and foreign payments, so ids can't be probed
    if (!customerId) throw new NotFoundException('Payment not found');

    return ability.can('cancel', { __typename: 'Payment', customerId });
  }
}
