export interface PaymentGateway {
  key: string;
  supportsPartialPayment: boolean;

  expiryInMinutes: number;
  /**
   * This member hold timeout in min if the system not verify and cash would be refund
   * possible scenarios:
   *  - fail to redirect after successful payment
   */
  verificationDeadlineInMinutes: number;

  createPayment(
    request: CreatePayment,
  ): Promise<{ paymentUrl: string; trackingCode: string }>;

  verifyPayment(
    providerId: number,
    trackingCode: string,
  ): Promise<PaymentStatus>;

  cancelPayment(providerId: number, trackingCode: string): Promise<void>;

  refundPayment(providerId: number, trackingCode: string): Promise<void>;
}

export type CreatePayment = {
  providerId: number;
  customer: {
    phone: string;
  };
  merchandise: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }[];

  amount: number;
};

export type PaymentStatus =
  | 'pending'
  | 'verified'
  | 'failed'
  | 'verified-before'
  | 'canceled'
  | 'expired'
  | 'reversed';
