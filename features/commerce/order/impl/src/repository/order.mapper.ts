import { orders } from '@infra/db-drizzle/schema';

type Insert = typeof orders.$inferInsert;
export type CreateOrderData = {
  customerId: string;
  items: Insert['items'];
  cancellationTerms:
    | {
        cancellationFeeType: 'fixed';
        cancellationFeeAmount: number;
        cancellationFeeRate: null;
      }
    | {
        cancellationFeeType: 'rate';
        cancellationFeeAmount: null;
        cancellationFeeRate: number;
      };
  summary: {
    cashback?: {
      rate: Insert['cashbackRate'];
      amount: Insert['cashbackAmount'];
    };
    discountTotal: Insert['discountTotal'];
    taxTotal: Insert['taxTotal'];
    grandTotal: Insert['grandTotal'];
    subtotal: Insert['subtotal'];
  };
};

export function toOrderInsert({
  customerId,
  items,
  cancellationTerms,
  summary,
}: CreateOrderData): typeof orders.$inferInsert {
  return {
    customerId,
    items,
    subtotal: summary.subtotal,
    discountTotal: summary.discountTotal,
    taxTotal: summary.taxTotal,
    grandTotal: summary.grandTotal,
    cashbackRate: summary.cashback?.rate ?? null,
    cashbackAmount: summary.cashback?.amount ?? null,
    ...cancellationTerms,
  };
}

export function toOrder(): 
