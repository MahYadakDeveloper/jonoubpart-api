import { PaymentCallbackHandler as PCH } from '@infra/payment-gateway';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentService } from './payment.service';

@Injectable()
export class PaymentCallbackHandler implements PCH {
  constructor(private readonly payments: PaymentService) {}

  async handle(paymentId: number) {
    const payment = await this.payments.findById(paymentId);
    if (!payment)
      throw new NotFoundException(
        `Payment ${paymentId} not found in gateway callback`,
      );

    const status = await this.payments.verify(paymentId);

    // Keep the expiry job while the gateway is still pending, otherwise the
    // payment could stay in processing forever.
    if (status !== 'pending' && payment.expiryJobId)
      await this.payments.cancelExpirePaymentJob(payment.expiryJobId);

    return { status };
  }
}
