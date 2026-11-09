import {
  PolicyContext,
  PolicyHandler,
} from '@feature/authorization-http/contracts';
import { MovementAbility } from './movement-ability.factory';

export class MovementManagementPolicy implements PolicyHandler<MovementAbility> {
  async handle(
    ability: MovementAbility,
    _context: PolicyContext,
  ): Promise<boolean> {
    return ability.can('manage', 'movement');
  }
}
