import {
  AbilityBuilder,
  createMongoAbility,
  type MongoAbility,
  type MongoQuery,
} from '@casl/ability';
import type { AbilityFactory } from '@feature/shared/contracts/ability-factory';
import type { AuthenticatedUser } from '@feature/shared/types/authenticated-user';

export type PaymentAction = 'cancel' | 'settle';

/** `customerId` is the owner of the order, as the payment has none until settled. */
export type PaymentSubjectType = {
  __typename: 'Payment';
  customerId: string;
};

export type PaymentSubject = 'Payment' | PaymentSubjectType;

export type PaymentAbilityTuple = [PaymentAction, PaymentSubject];

export type PaymentAbility = MongoAbility<PaymentAbilityTuple, MongoQuery>;

export class PaymentAbilityFactory implements AbilityFactory<PaymentAbility> {
  createFor(user: AuthenticatedUser): PaymentAbility {
    const { can, build } = new AbilityBuilder(
      createMongoAbility<PaymentAbilityTuple, MongoQuery>,
    );

    if (user.role === 'customer') {
      can('settle', 'Payment', { customerId: user.id });
      can('cancel', 'Payment', { customerId: user.id });
    }

    return build({ detectSubjectType: (object) => object.__typename });
  }
}
