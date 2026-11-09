import { CustomerType } from '@feature/shared/types/customer-type';

// Discounts and policy depend on the customer; absent means a retail anonymous customer.
export type PricingContext = {
  customer?: {
    id: string;
    type: CustomerType;
  }; // absent: anonymous retail, no customer-specific discounts
  asOf?: Date; // defaults to now
};

export type PriceItemRequest = {
  productId: string;
  quantity: number; // positive integer
};

export type PriceResult = {
  asOf: Date;
  items: PricedItem[]; // same order as request.items
  totals: {
    subtotal: number; // Σ unitPrice × quantity
    discount: number; // Σ item discounts
    net: number; // subtotal − discount
  };
};

export type PricedItem = {
  key: string;
  productId: string;
  quantity: number;
  unitPrice: number; // display unit price, after bundle adjustment
  gross: number; // unitPrice × quantity
  discount?: AppliedDiscount;
  net: number; // gross − (discount?.total ?? 0)
  components?: PricedComponent[]; // present only for bundles
};

export type AppliedDiscount = {
  ruleId: string;
  perUnit: number;
  quantity: number; // units that received the discount
  total: number;
};

export type PricedComponent = {
  productId: string;
  quantity: number; // per bundle
  unitPrice: number; // includes the bundle's display adjustment
  lineTotal: number;
};

export type ProductPricesRequest = PricingContext & {
  productIds: string[];
};

export type ProductPricesResponse = {
  prices: { productId: string; unitPrice: number }[];
};

export type PricedInvoice = {
  pricedAt: string; // ISO timestamp for the snapshot
  lines: PricedLine[];
  summary: InvoiceSummary;
};

export type PricedLine = {
  lineId: string;
  kind: 'leaf' | 'bundle';
  productId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number; // unitPrice × quantity − discount.total
  discount?: AppliedDiscount; // allowed on any top-level line
  components?: PricedComponent[]; // only for bundles; never carry discounts
};

export type InvoiceSummary = {
  subtotal: number; // Σ unitPrice × quantity
  discount: number; // Σ line discounts
  tax: number; // 0 until tax rules exist
  total: number; // subtotal − discount + tax
};
