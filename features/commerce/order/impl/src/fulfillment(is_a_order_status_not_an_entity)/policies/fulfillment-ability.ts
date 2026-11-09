import {
  AbilityBuilder,
  createMongoAbility,
  type MongoAbility,
  type MongoQuery,
} from '@casl/ability';
import type { AbilityFactory } from '@feature/shared/contracts/ability-factory';
import type { AuthenticatedUser } from '@feature/shared/types/authenticated-user';

export type FulfillmentAction = 'manage';

export type FulfillmentSubject = 'Fulfillment';

export type FulfillmentAbilityTuple = [FulfillmentAction, FulfillmentSubject];

export type FulfillmentAbility = MongoAbility<
  FulfillmentAbilityTuple,
  MongoQuery
>;

export class FulfillmentAbilityFactory implements AbilityFactory<FulfillmentAbility> {
  createFor(user: AuthenticatedUser): FulfillmentAbility {
    const { can, build } = new AbilityBuilder(
      createMongoAbility<FulfillmentAbilityTuple, MongoQuery>,
    );

    if (user.role === 'admin' || user.role === 'manager') {
      can('manage', 'Fulfillment');
    }

    return build();
  }
}
