import { PolicyContext } from '@feature/shared/contracts/policy-context';
import { PolicyHandler } from '@feature/shared/contracts/policy-handler';
import { DeliveryAbility } from './delivery-ability';

export class ConfirmPickupPolicyHandler implements PolicyHandler<DeliveryAbility> {
  constructor() {}

  async handle(
    ability: DeliveryAbility,
    context: PolicyContext,
  ): Promise<boolean> {
    return ability.can('pickup-confirm', 'Delivery');
  }
}
