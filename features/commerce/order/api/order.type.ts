export type OrderStatus =
  | 'recorded'
  | 'settlement'
  | 'canceled'
  | 'canceled_by_admin'
  | 'process'
  | 'handed-over-to-courier'
  | 'courier-requested'
  | 'delivered';

export type PaymentResult =
  | {
      status: 'paid';
      gateway: string;
      ticketId: string;
      providerId: number; // useful for confirming delivery for example: digipay
      settledAt: Date;
    }
  | {
      status: 'expired' | 'canceled' | 'reversed' | 'invalid';
      gateway?: string;
      ticketId: string;
      occurredAt: Date;
    };
