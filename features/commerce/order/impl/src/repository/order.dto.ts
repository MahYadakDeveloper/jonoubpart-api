import { orders, payments } from '@infra/db-drizzle/schema';

type x = typeof payments.$inferSelect;
type Payment = {};

export type Order = {
  id: string;
  customerId: string;
  items: typeof orders.$inferSelect.items;
  cancellationTerms: {
    fee:
      | {
          type: 'fixed';
          amount: number;
        }
      | {
          type: 'rate';
          rate: number;
        };
  };
  summary: {
    cashback?: {
      rate: number;
      amount: number;
    };
    discountTotal?: number;
    grandTotal: number;
    tax: number;
    subtotal: number;
  };
} & (
  | {
      delivery: Extract<Delivery, { status: 'initial' }>;
      payment: Extract<Payment, { status: 'pending' | 'initiated' }>;
    }
  | ({
      payment: Extract<Payment, { status: 'paid' }>;
    } & (
      | {
          fulfillment: Extract<Fulfillment, { status: 'processing' }>;
          delivery: Extract<Delivery, { status: 'initial' }>;
        }
      | ({
          fulfillment: Extract<Fulfillment, { status: 'processed' }>;
        } & (
          | {
              delivery: Extract<
                Delivery,
                { status: 'courier_requested' | 'handed_over_to_courier' }
              >;
            }
          | {
              delivery: Extract<Delivery, { status: 'delivered' }>;
            }
        ))
    ))
  | ({
      payment: Extract<Payment, { status: 'refunded' }>;
    } & (
      | {
          fulfillment: Extract<Fulfillment, { status: 'canceled_by_customer' }>;
          delivery: Extract<Delivery, { status: 'canceled' }>;
        }
      | {
          fulfillment: Extract<Fulfillment, { status: 'canceled_by_merchant' }>;
          delivery: Extract<Delivery, { status: 'canceled' }>;
        }
      | {
          delivery: Extract<Delivery, { status: 'returned_to_warehouse' }>;
          fulfillment: Extract<Fulfillment, { status: 'fulfilled' }>;
        }
    ))
  | {
      payment: Extract<Payment, { status: 'failure' | 'expired' | 'canceled' }>;
      fulfillment: Extract<Fulfillment, { status: 'canceled' }>;
      delivery: Extract<Delivery, { status: 'canceled' }>;
    }
);
