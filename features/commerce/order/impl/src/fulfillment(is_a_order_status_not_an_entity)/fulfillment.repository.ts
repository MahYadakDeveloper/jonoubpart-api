import { DrizzleBaseRepository } from '@infra/db-drizzle';
import { fulfillments, orderRelations } from '@infra/db-drizzle/schema';
import { DBQueryConfigWith, eq } from 'drizzle-orm';

const withItems = {
  merchandiseLines: {
    with: {
      items: true,
    },
  },
} satisfies DBQueryConfigWith<
  typeof orderRelations,
  typeof orderRelations.fulfillments.relations
>;

export class FulfillmentRepository extends DrizzleBaseRepository<
  typeof orderRelations
> {
  findById(id: string) {
    return this.db.query.fulfillments.findFirst({
      where: {
        id,
      },
      with: { ...withItems },
    });
  }

  list() {
    return this.db.query.fulfillments.findMany({
      with: { ...withItems },
    });
  }

  update(
    id: string,
    data: Pick<typeof fulfillments.$inferInsert, 'status', 'reason'>,
  ) {
    return this.db
      .update(fulfillments)
      .set(data)
      .where(eq(fulfillments.id, id))
      .returning({ id: fulfillments.id });
  }
}
