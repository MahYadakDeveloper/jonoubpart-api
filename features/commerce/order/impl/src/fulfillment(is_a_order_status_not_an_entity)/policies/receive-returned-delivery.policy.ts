import { PolicyContext } from '@feature/shared/contracts/policy-context';
import { PolicyHandler } from '@feature/shared/contracts/policy-handler';
import { FulfillmentAbility } from './fulfillment-ability';

export class ManageFulfillmentsPolicyHandler implements PolicyHandler<FulfillmentAbility> {
  constructor() {}

  async handle(
    ability: FulfillmentAbility,
    context: PolicyContext,
  ): Promise<boolean> {
    return ability.can('manage', 'Fulfillment');
  }
}
