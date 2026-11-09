import {
  PolicyContext,
  PolicyHandler,
} from '@feature/authorization-http/contracts';
import { StockAbility } from './stock-ability';

export class StockManagementPolicyHandler implements PolicyHandler<StockAbility> {
  async handle(
    ability: StockAbility,
    _context: PolicyContext,
  ): Promise<boolean> {
    return ability.can('manage', 'Stock');
  }
}
