import { CustomerType, Money } from '@feature/shared';

export interface RecordSaleRequest {
  cashierId: string;
  customer?: {
    id: string;
    type: CustomerType;
  };
  useWallet?: { mode: 'full' } | { mode: 'partial'; amount: Money };
  manualDiscount?: Money;
  items: {
    productId: string;
    qty: number;
  }[];
}
