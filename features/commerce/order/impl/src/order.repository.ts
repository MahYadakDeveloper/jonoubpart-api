import { toMerchandiseLineInsertPlans } from '@feature/shared/mappers/to-merchandise-line.mapper';
import type { MerchandiseLine } from '@feature/shared/types/merchandise-line';
import {
  DrizzleBaseRepository,
  DrizzleDbProvider,
  DrizzleTransactionContext,
} from '@infra/db-drizzle';
import {
  deliveries,
  merchandiseLine,
  orderRelations,
  orders,
  orderSummary,
  payments,
} from '@infra/db-drizzle/schema';
import { AsyncLocalStorage } from 'async_hooks';
import { and, eq } from 'drizzle-orm';

export class OrderRepository extends DrizzleBaseRepository<
  typeof orderRelations
> {
  constructor(
    dbProvider: DrizzleDbProvider<typeof orderRelations>,
    forUpdateCtx: AsyncLocalStorage<'for_update'>,
    private readonly tx: DrizzleTransactionContext,
  ) {
    super(dbProvider, forUpdateCtx);
  }

  hasPendingPaymentByCustomerId(customerId: string): Promise<boolean> {
    return this.db
      .select({ id: orders.id })
      .from(orders)
      .innerJoin(payments, eq(payments.orderId, orders.id))
      .where(
        and(eq(orders.customerId, customerId), eq(payments.status, 'pending')),
      )
      .limit(1)
      .then((rows) => rows.length > 0);
  }

  create(data: {
    customerId: string;
    cancellationFee: (typeof orders.$inferInsert)['cancellationFee'];
    merchandiseLines: MerchandiseLine[];
    summary: Omit<typeof orderSummary.$inferInsert, 'orderId'>;
    recipient: (typeof deliveries.$inferInsert)['recipient'];
    carrierKey?: string;
  }): Promise<{ id: string }> {
    return this.tx.run(async () => {
      const [order] = await this.db
        .insert(orders)
        .values({
          customerId: data.customerId,
          cancellationFee: data.cancellationFee,
        })
        .returning({ id: orders.id });
      if (!order) throw new Error('Order insert did not return an ID');

      const plans = toMerchandiseLineInsertPlans(
        { orderId: order.id },
        data.merchandiseLines,
      );

      const insertedRoots = await this.db
        .insert(merchandiseLine)
        .values(
          plans.map((plan) => (plan.kind === 'leaf' ? plan.leaf : plan.bundle)),
        )
        .returning({ id: merchandiseLine.id });
      if (insertedRoots.length !== plans.length) {
        throw new Error('Merchandise line insert did not return all IDs');
      }

      const bundleItemRows = plans.flatMap((plan, index) => {
        if (plan.kind !== 'bundle') return [];

        const bundleId = insertedRoots[index].id;
        return plan.items.map((item) => ({ ...item, bundleId }));
      });

      // Leaf-only orders have no bundle items, and Drizzle rejects an empty values list.
      if (bundleItemRows.length > 0) {
        await this.db.insert(merchandiseLine).values(bundleItemRows);
      }

      // order summary
      await this.db
        .insert(orderSummary)
        .values({ ...data.summary, orderId: order.id });

      // delivery
      await this.db.insert(deliveries).values({
        orderId: order.id,
        recipient: data.recipient,
        carrierKey: data.carrierKey ?? null,
      });

      // payment
      await this.db.insert(payments).values({ orderId: order.id });

      return order;
    });
  }

  findByCustomerId(customerId: string) {}

  findById(id: string) {
    return this.db.query.orders.findFirst({
      where: {
        id,
      },
      with: {
        payment: {
          columns: {
            orderId: false,
          },
        },
        delivery: {
          columns: {
            id: false,
            orderId: false,
          },
        },
        merchandise: {
          columns: {
            saleId: false,
            orderId: false,
            id: false,
          },
        },
      },
    });
  }
  findBySessionId(
    sessionId: number,
  ): Promise<Extract<Order, { status: 'settlement' }>>;

  findByCustomerIdWithPaymentPendingStatus(
    customerId: string,
  ): Promise<LineItems<Order>>;

  findOrderHandOverToCourier(
    orderId: string,
  ): Promise<Extract<
    Order,
    { status: 'handed-over-to-courier'; delivery: { scope: 'intra-city' } }
  > | null>;

  markAs(orderId: string, status: Order['status']): Promise<void>;

  // markAsPaid(
  //   id: string,
  //   data: PartialBy<
  //     Extract<Order, { status: 'process' }>,
  //     Extract<
  //       keyof Extract<Order, { status: 'settlement' }>,
  //       keyof Extract<Order, { status: 'process' }>
  //     >
  //   >,
  // ): Promise<void>;
}
