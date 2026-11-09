import { DrizzleBaseRepository, DrizzleDbProvider } from '@infra/db-drizzle';
import {
  deliveries,
  merchandiseLine,
  orderRelations,
  orders,
  orderSummary,
  payments,
} from '@infra/db-drizzle/schema';
import { AsyncLocalStorage } from 'async_hooks';
import { and, asc, eq } from 'drizzle-orm';

export type PaymentRow = typeof payments.$inferSelect;

/** Mirrors the `payments_method_allocation` check constraint. */
export type Settlement = { settledAt: Date; customerId: string } & (
  | { status: 'paid'; method: 'wallet'; amount: number }
  | {
      status: 'processing';
      method: 'gateway';
      amount: number;
      gatewayKey: string;
      trackingCode: string;
    }
  | {
      status: 'processing';
      method: 'partial';
      walletAmount: number;
      gatewayAmount: number;
      gatewayKey: string;
      trackingCode: string;
    }
);

/** Mirrors the `payments_refund_fields` check constraint. */
export type PaymentStatusUpdate =
  | { status: 'pending' | 'failure' | 'expired' | 'paid' }
  | {
      status: 'refunded';
      refundType: 'full';
      refundDestination: 'wallet' | 'gateway' | 'partial';
    }
  | {
      status: 'refunded';
      refundType: 'partial';
      refundDestination: 'wallet';
      refundedAmount: number;
    };

export class PaymentRepository extends DrizzleBaseRepository<
  typeof orderRelations
> {
  constructor(
    dbProvider: DrizzleDbProvider<typeof orderRelations>,
    forUpdateCtx: AsyncLocalStorage<'for_update'>,
  ) {
    super(dbProvider, forUpdateCtx);
  }

  findById(id: number) {
    return this.db
      .select()
      .from(payments)
      .where(eq(payments.id, id))
      .then(([row]) => row ?? null);
  }

  findByOrderId(orderId: string) {
    return this.db
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId))
      .then(([row]) => row ?? null);
  }

  update(
    paymentId: number,
    data: Omit<typeof payments.$inferInsert, 'id' | 'orderId'>,
  ) {
    return this.db
      .update(payments)
      .set(data)
      .where(eq(payments.id, paymentId))
      .returning({ id: payments.id });
  }

  /** Pending payments have no customer yet, so ownership comes from the order. */
  findOwnerId(paymentId: number): Promise<string | null> {
    return this.db
      .select({ customerId: orders.customerId })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(eq(payments.id, paymentId))
      .then(([row]) => row?.customerId ?? null);
  }

  /** Everything settle needs to charge the order, in one place. */
  async findSettleContext(paymentId: number) {
    const [row] = await this.db
      .select({
        payment: payments,
        orderCustomerId: orders.customerId,
        amount: orderSummary.grandTotal,
        recipient: deliveries.recipient,
      })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .innerJoin(orderSummary, eq(orderSummary.orderId, payments.orderId))
      .innerJoin(deliveries, eq(deliveries.orderId, payments.orderId))
      .where(eq(payments.id, paymentId))
      .limit(1);
    if (!row) return null;

    const merchandise = await this.db
      .select({
        productId: merchandiseLine.productId,
        productName: merchandiseLine.displayName,
        quantity: merchandiseLine.quantity,
        unitPrice: merchandiseLine.unitPrice,
      })
      .from(merchandiseLine)
      .where(eq(merchandiseLine.orderId, row.payment.orderId))
      .orderBy(asc(merchandiseLine.position));

    return {
      payment: row.payment,
      orderCustomerId: row.orderCustomerId,
      amount: row.amount,
      customerPhone: row.recipient.customerContact.phone,
      merchandise,
    };
  }

  /**
   * Moves a pending payment to the chosen method. Returns false when the
   * payment is no longer pending, so callers can abort their transaction.
   */
  async settle(id: number, s: Settlement): Promise<boolean> {
    const allocation =
      s.method === 'partial'
        ? {
            amount: null,
            walletAmount: s.walletAmount,
            gatewayAmount: s.gatewayAmount,
          }
        : { amount: s.amount, walletAmount: null, gatewayAmount: null };
    const gateway =
      s.method === 'wallet'
        ? { gatewayKey: null, trackingCode: null }
        : { gatewayKey: s.gatewayKey, trackingCode: s.trackingCode };

    const rows = await this.db
      .update(payments)
      .set({
        status: s.status,
        method: s.method,
        customerId: s.customerId,
        settleRequestedAt: s.settledAt,
        paidAt: s.status === 'paid' ? s.settledAt : null,
        ...allocation,
        ...gateway,
      })
      .where(and(eq(payments.id, id), eq(payments.status, 'pending')))
      .returning({ id: payments.id });

    return rows.length > 0;
  }

  /**
   * Sets the status together with its matching timestamp, as required by the
   * `payments_paid_timestamp` and `payments_refund_fields` check constraints.
   * Going back to `pending` also drops the chosen method, as required by
   * `payments_status_method`.
   */
  async updateStatus(id: number, update: PaymentStatusUpdate): Promise<void> {
    const now = new Date();
    const cleared = {
      paidAt: null,
      refundedAt: null,
      refundType: null,
      refundDestination: null,
      refundedAmount: null,
    };

    const values: Partial<typeof payments.$inferInsert> =
      update.status === 'paid'
        ? { ...cleared, status: 'paid', paidAt: now }
        : update.status === 'refunded'
          ? {
              ...cleared,
              status: 'refunded',
              refundedAt: now,
              refundType: update.refundType,
              refundDestination: update.refundDestination,
              refundedAmount:
                update.refundType === 'partial' ? update.refundedAmount : null,
            }
          : update.status === 'pending'
            ? {
                ...cleared,
                status: 'pending',
                method: null,
                amount: null,
                walletAmount: null,
                gatewayAmount: null,
                gatewayKey: null,
                trackingCode: null,
                settleRequestedAt: null,
              }
            : { ...cleared, status: update.status };

    await this.db.update(payments).set(values).where(eq(payments.id, id));
  }
}
