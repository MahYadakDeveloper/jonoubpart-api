import {
  AbilityBuilder,
  createMongoAbility,
  type MongoAbility,
  type MongoQuery,
} from '@casl/ability';
import type { AbilityFactory } from '@feature/shared/contracts/ability-factory';
import type { AuthenticatedUser } from '@feature/shared/types/authenticated-user';

export type DeliveryAction =
  | 'pickup-confirm'
  | 'report-delivery-attempt'
  | 'receive-delivery-returned';

/** `customerId` is the owner of the order, as the payment has none until settled. */
export type DeliverySubjectType = {
  __typename: 'Delivery';
  courierId: string;
};

export type DeliverySubject = 'Delivery' | DeliverySubjectType;

export type DeliveryAbilityTuple = [DeliveryAction, DeliverySubject];

export type DeliveryAbility = MongoAbility<DeliveryAbilityTuple, MongoQuery>;

export class DeliveryAbilityFactory implements AbilityFactory<DeliveryAbility> {
  createFor(user: AuthenticatedUser): DeliveryAbility {
    const { can, build } = new AbilityBuilder(
      createMongoAbility<DeliveryAbilityTuple, MongoQuery>,
    );

    switch (user.role) {
      case 'admin':
      case 'manager':
        can('receive-delivery-returned', 'Delivery');
        break;
      case 'courier':
        can('pickup-confirm', 'Delivery');
        can('report-delivery-attempt', 'Delivery', { courierId: user.id });
        break;
    }

    return build({ detectSubjectType: (object) => object.__typename });
  }
}
