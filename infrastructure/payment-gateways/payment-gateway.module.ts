import { appConfig } from '@infra/config';
import { RedisModule } from '@infra/db-redis';
import { HttpModule } from '@nestjs/axios';
import {
  DynamicModule,
  Module,
  type ModuleMetadata,
  type Type,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AzkivamTokenStore } from './azkivam/azkivam-token.store';
import { azkivamConfig } from './azkivam/azkivam.config';
import { AzkivamCallbackController } from './azkivam/azkivam.controller';
import { AzkivamGateway } from './azkivam/azkivam.gateway';
import {
  PAYMENT_CALLBACK_HANDLER,
  type PaymentCallbackHandler,
} from './payment-callback.handler';
import {
  PAYMENT_GATEWAYS,
  PaymentGatewayResolver,
} from './payment-gateway.resolver';

export type PaymentGatewayModuleOptions = {
  /** Modules exporting the dependencies required by the callback handler. */
  imports?: ModuleMetadata['imports'];
  /** Feature-side implementation shared by every gateway callback. */
  callbackHandler: Type<PaymentCallbackHandler>;
};

@Module({})
export class PaymentGatewayModule {
  static forRoot({
    imports = [],
    callbackHandler,
  }: PaymentGatewayModuleOptions): DynamicModule {
    return {
      module: PaymentGatewayModule,
      imports: [
        RedisModule,
        HttpModule,
        ConfigModule.forFeature(azkivamConfig),
        ConfigModule.forFeature(appConfig),
        ...imports,
      ],
      controllers: [AzkivamCallbackController],
      providers: [
        { provide: PAYMENT_CALLBACK_HANDLER, useExisting: callbackHandler },
        AzkivamTokenStore,
        AzkivamGateway,
        {
          provide: PAYMENT_GATEWAYS,
          useFactory: (azkivam: AzkivamGateway) => [azkivam],
          inject: [AzkivamGateway],
        },
        PaymentGatewayResolver,
      ],
      exports: [PaymentGatewayResolver],
    };
  }
}
