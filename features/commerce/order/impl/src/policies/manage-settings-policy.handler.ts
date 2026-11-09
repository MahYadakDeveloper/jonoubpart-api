import { PolicyContext, PolicyHandler } from '@feature/authorization-api';
import { OrderAbility } from './order-ability';

export class ManageOrderSettingsPolicy implements PolicyHandler<OrderAbility> {
  async handle(
    ability: OrderAbility,
    context: PolicyContext,
  ): Promise<boolean> {
    return ability.can('manage', 'Settings');
  }
}
