import { DrizzleBaseRepository, DrizzleDbProvider } from '@infra/db-drizzle';
import {
  actorsRelations,
  addresses,
  customers,
} from '@infra/db-drizzle/schema';
import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { DBQueryConfigWith } from 'drizzle-orm';

export type Customer = typeof customers.$inferSelect & {
  addresses: Omit<typeof addresses.$inferSelect, 'customerId'>[];
};

const withAddresses = {
  addresses: {
    columns: {
      customerId: false,
    },
  },
} satisfies DBQueryConfigWith<
  typeof actorsRelations,
  typeof actorsRelations.customers.relations
>;

@Injectable()
export class CustomerRepository extends DrizzleBaseRepository<
  typeof actorsRelations
> {
  constructor(
    dbProvider: DrizzleDbProvider<typeof actorsRelations>,
    forUpdateCtx: AsyncLocalStorage<'for_update'>,
  ) {
    super(dbProvider, forUpdateCtx);
  }

  findById(id: string) {
    return this.db.query.customers.findFirst({
      where: {
        id,
      },
      with: {
        ...withAddresses,
      },
    });
  }

  findByPhone(phone: string) {
    return this.db.query.customers.findFirst({
      where: {
        phone,
      },
      with: {
        ...withAddresses,
      },
    });
  }

  create(customer: typeof customers.$inferInsert) {
    return this.db
      .insert(customers)
      .values(customer)
      .returning({ id: customers.id });
  }
}
