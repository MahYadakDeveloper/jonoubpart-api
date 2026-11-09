import {
  AbilityBuilder,
  createMongoAbility,
  MongoAbility,
  MongoQuery,
} from '@casl/ability';
import { AuthenticatedUser } from '@feature/authentication-http';
import { AbilityFactory } from '@feature/authorization-http/contracts';

type Tuple = ['manage', 'movement'];
export type MovementAbility = MongoAbility<Tuple>;

export class MovementAbilityFactor implements AbilityFactory<MovementAbility> {
  createFor(user: AuthenticatedUser): MovementAbility {
    const ability = new AbilityBuilder(createMongoAbility<Tuple, MongoQuery>);
    switch (user.role) {
      case 'manager':
        ability.can('manage', 'movement');
    }

    return ability.build();
  }
}
