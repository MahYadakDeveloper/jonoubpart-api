import { CreatePayment, PaymentGateway, PaymentStatus } from '../contracts';

export class DigipayGateway implements PaymentGateway {
  createPayment(
    request: CreatePayment,
  ): Promise<{ paymentUrl: string; trackingCode: string }> {
    throw new Error('Method not implemented.');
  }
  verifyPayment(
    providerId: number,
    trackingCode: string,
  ): Promise<PaymentStatus> {
    throw new Error('Method not implemented.');
  }
  cancelPayment(providerId: number, trackingCode: string): Promise<void> {
    throw new Error('Method not implemented.');
  }
  refundPayment(providerId: number, trackingCode: string): Promise<void> {
    throw new Error('Method not implemented.');
  }
  key: string;
  supportsPartialPayment: boolean;
  expiryInMinutes: number;
  verificationDeadlineInMinutes: number;

  readonly name: string = 'digipay' as const;
}
