import { Inject, Injectable } from '@nestjs/common';
import { PaymentGateway } from './contracts';

export const PAYMENT_GATEWAYS = Symbol('PAYMENT_GATEWAYS');

@Injectable()
export class PaymentGatewayResolver {
  private readonly gateways: Map<string, PaymentGateway>;

  constructor(@Inject(PAYMENT_GATEWAYS) gateways: PaymentGateway[]) {
    this.gateways = new Map(gateways.map((gateway) => [gateway.key, gateway]));
  }

  resolve(key: string): PaymentGateway {
    const gateway = this.gateways.get(key);

    if (!gateway) throw new Error(`Payment gateway not found: ${key}`);

    return gateway;
  }
}
