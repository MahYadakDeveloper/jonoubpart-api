import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { type AuthenticatedUser } from '@feature/authentication-api';
import { AuthenticationGuard, User } from '@feature/authentication-nest';
import { CheckPolicies, PoliciesGuard } from '@feature/authorization-nest';

import { orderSettingsSchema, type OrderSettings } from './order.settings';
import { CancelOrderPolicy } from './policies/cancel-order-policy.handler';
import { ManageOrderSettingsPolicy } from './policies/manage-settings-policy.handler';
import { OrderAbilityFactory } from './policies/order-ability';
import { ReadOrderPolicy } from './policies/read-order-policy.handler';
import { RecordOrderPolicy } from './policies/record-order-policy.handler';
import {
  recordOrderSchema,
  type RecordOrderType,
} from './schema/record-order.schema';

@Controller('order')
export class OrderController {
  constructor(private readonly order: OrderApi) {}

  /*
   * [NOTE]
   * Register the ability factory and policy handlers as providers.
   * PoliciesGuard resolves them through ModuleRef.
   *
   * AuthenticationGuard and PoliciesGuard do not need to be registered
   * as providers in the feature module. They are provided globally by the
   * application container and can be resolved by NestJS when used with
   * @UseGuards().
   *
   * The feature module only needs to register its ability factory and policy
   * handlers, which are resolved dynamically by PoliciesGuard through ModuleRef.
   */
  @UseGuards(AuthenticationGuard, PoliciesGuard)
  @CheckPolicies({
    abilityFactory: OrderAbilityFactory,
    handlers: [ReadOrderPolicy],
  })
  @Get(':id')
  getOrderById(@Param('id', { schema: z.object({}) }) orderId: string) {
    return this.order.getById({ orderId }).then(({ order }) => order);
  }

  @Get()
  listOrders() {}

  @UseGuards(AuthenticationGuard, PoliciesGuard)
  @CheckPolicies({
    abilityFactory: OrderAbilityFactory,
    handlers: [RecordOrderPolicy],
  })
  @Post()
  placeOrder(
    @Body({ schema: recordOrderSchema }) body: RecordOrderType,
    @User() user: Extract<AuthenticatedUser, { role: 'customer' }>,
  ) {
    return this.order.place({
      // paymentGetawayId: ,//__
      // customerId: user.id,
      // items: body.items,
      // recipient: {
      //   ...body.recipient,
      //   customer: {
      //     id: user.id,
      //     contact: {
      //       ...user,
      //     },
      //   },
      // },
    });
  }

  @UseGuards(AuthenticationGuard, PoliciesGuard)
  @CheckPolicies({
    abilityFactory: OrderAbilityFactory,
    handlers: [CancelOrderPolicy],
  })
  @Post(':id')
  cancel(@Param('id', { schema: z.uuid() }) orderId: string) {
    return this.orderService.cancelOrder({ orderId });
  }

  @UseGuards(AuthenticationGuard, PoliciesGuard)
  @CheckPolicies({
    abilityFactory: OrderAbilityFactory,
    handlers: [ManageOrderSettingsPolicy],
  })
  @Post()
  setSetting(@Body({ schema: orderSettingsSchema }) settings: OrderSettings) {
    this.orderService.setSettings({ settings });
  }
}
