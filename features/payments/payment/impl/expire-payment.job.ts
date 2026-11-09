import {
  JobHandler,
  ScheduledJob,
} from '@infra/messaging-job-scheduler/contracts';
import { Injectable } from '@nestjs/common';
import { PaymentService } from './payment.service';

@Injectable()
@ScheduledJob('order.expire-payment')
export class ExpirePaymentJob implements JobHandler<{ paymentId: number }> {
  constructor(private readonly payments: PaymentService) {}
  async handle(payload: { paymentId: number }): Promise<void> {
    const payment = await this.payments.findById(payload.paymentId);

    switch (payment.status) {
      case 'pending':
        await this.payments.expire(payment.id);
        return;
      case 'processing':
        await this.payments.verify(payment.id);
        return;
    }
  }
}
