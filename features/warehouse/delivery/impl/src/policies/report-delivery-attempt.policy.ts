import { PolicyContext } from '@feature/shared/contracts/policy-context';
import { PolicyHandler } from '@feature/shared/contracts/policy-handler';
import { NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { DeliveryService } from '../delivery.service';
import { DeliveryAbility } from './delivery-ability';

export class ReportDeliveryAttemptPolicyHandler implements PolicyHandler<DeliveryAbility> {
  constructor(private readonly delivery: DeliveryService) {}

  async handle(
    ability: DeliveryAbility,
    context: PolicyContext,
  ): Promise<boolean> {
    const id = z.uuid().parse(context.params.id);

    const courierId = await this.delivery.getAssignedCourierId(id);

    return ability.can('report-delivery-attempt', {
      __typename: 'Delivery',
      courierId,
    });
  }
}
