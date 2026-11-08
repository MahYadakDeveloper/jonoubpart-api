import { DrizzleBaseRepository, DrizzleDbProvider } from '@infra/db-drizzle';
import {
  deliveries,
  deliveryAttemptFailures,
  orderRelations,
} from '@infra/db-drizzle/schema';
import { AsyncLocalStorage } from 'async_hooks';
import { eq } from 'drizzle-orm';

export class DeliveryRepository extends DrizzleBaseRepository<
  typeof orderRelations
> {
  constructor(
    dbProvider: DrizzleDbProvider<typeof orderRelations>,
    forUpdateCtx: AsyncLocalStorage<'for_update'>,
  ) {
    super(dbProvider, forUpdateCtx);
  }

  findAssignedCourierId(deliveryId: string): Promise<string | null> {
    return this.db
      .select({ courierId: deliveries.courierId })
      .from(deliveries)
      .where(eq(deliveries.id, deliveryId))
      .then(([row]) => row.courierId);
  }

  findById(id: string) {
    return this.db.query.deliveries
      .findFirst({
        where: {
          id,
        },
        with: {
          attempts: true,
          courier: true,
        },
      })
      .then((d) => d ?? null);
  }

  findAll() {
    return this.db.select().from(deliveries);
  }

  update(
    deliveryId: string,
    data: Partial<Omit<typeof deliveries.$inferInsert, 'id'>>,
  ) {
    return this.db
      .update(deliveries)
      .set(data)
      .where(eq(deliveries.id, deliveryId))
      .returning({ id: deliveries.id });
  }

  recordDeliveryAttemptFailure(
    report: Pick<
      typeof deliveryAttemptFailures.$inferInsert,
      'reason' | 'reasonMessage' | 'deliveryId'
    >,
  ) {
    return this.db
      .select({ scope: deliveries.scope })
      .from(deliveries)
      .where(eq(deliveries.id, report.deliveryId))
      .then(([delivery]) => {
        if (!delivery?.scope) {
          throw new Error(
            `Cannot create delivery attempt report: delivery ${report.deliveryId} was not found`,
          );
        }

        return this.db
          .insert(deliveryAttemptFailures)
          .values({ ...report, scope: delivery.scope })
          .returning({ id: deliveryAttemptFailures.id });
      });
  }
}
