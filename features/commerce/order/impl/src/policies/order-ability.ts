import {
  AbilityBuilder,
  createMongoAbility,
  type MongoAbility,
  type MongoQuery,
} from '@casl/ability';
import type { AuthenticatedUser } from '@feature/authentication-api';
import type { AbilityFactory } from '@feature/authorization-api';
import { Order } from '../model/order';

export type OrderAction = 'manage' | 'read' | 'cancel' | 'record';

export type OrderSubjectType = Order & { __typename: 'Order' };

export type OrderSubject = 'Order' | OrderSubjectType | 'Settings';

export type OrderAbilityTuple = [OrderAction, OrderSubject];

export type OrderAbility = MongoAbility<OrderAbilityTuple, MongoQuery>;

export class OrderAbilityFactory implements AbilityFactory<OrderAbility> {
  createFor(user: AuthenticatedUser): OrderAbility {
    const { can, build } = new AbilityBuilder(
      createMongoAbility<OrderAbilityTuple, MongoQuery>,
    );

    switch (user.role) {
      case 'admin':
      case 'manager':
        can('read', 'Order');
        can('manage', 'Settings');

        break;

      case 'customer':
        can('read', 'Order', {
          customerId: user.id,
        });

        can('cancel', 'Order', {
          customerId: user.id,
        });

        can('record', 'Order');
        break;

      case 'courier':
        break;
    }

    return build({ detectSubjectType: (object) => object.__typename });
  }
}
