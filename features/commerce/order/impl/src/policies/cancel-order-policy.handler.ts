import { PolicyContext, PolicyHandler } from '@feature/authorization-api';
import { OrderService } from '../order.service';
import { OrderAbility } from './order-ability';

export class CancelOrderPolicy implements PolicyHandler<OrderAbility> {
  constructor(private readonly orders: OrderService) {}

  async handle(
    ability: OrderAbility,
    context: PolicyContext,
  ): Promise<boolean> {
    const orderId = context.params.id;

    const { order } = await this.orders.findById({
      orderId,
    });

    return ability.can('cancel', { ...order, __typename: 'Order' });
  }
}
