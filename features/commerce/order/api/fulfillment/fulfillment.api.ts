import { LineItems } from '@feature/shared';

export interface FulfillmentApi {
  create(req: {
    orderId: string;
    items: LineItems<{ productId: string; quantity: number }>;
  }): Promise<void>;
  fulfill(req: { orderId: string }): Promise<void>;
  cancel({ orderId }: { orderId: string }): Promise<void>;
}
