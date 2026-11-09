import { Money, OffsetPagination, PageResult } from '@feature/shared';
import {
  DrizzleBaseRepository,
  DrizzleDbProvider,
  DrizzleTransactionContext,
  orderBy,
  PageCriteria,
  sortableFields,
} from '@infra/db-drizzle';
import {
  actorsRelations,
  freezedAmounts,
  wallets,
  walletTransactions,
} from '@infra/db-drizzle/schema';
import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { and, count, eq, sql } from 'drizzle-orm';

export type Wallet = typeof wallets.$inferSelect;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export const walletTransactionsSortableFields =
  sortableFields(walletTransactions);

export class WalletRepository extends DrizzleBaseRepository<
  typeof actorsRelations
> {
  constructor(
    dbProvider: DrizzleDbProvider<typeof actorsRelations>,
    forUpdateCtx: AsyncLocalStorage<'for_update'>,
    private readonly tx: DrizzleTransactionContext,
  ) {
    super(dbProvider, forUpdateCtx);
  }

  async findByCustomerId(customerId: string): Promise<Wallet | null> {
    if (this.forUpdateCtx.getStore() === 'for_update')
      await this.lock('wallet', customerId);

    return this.db.query.wallets
      .findFirst({
        where: {
          customerId,
        },
      })
      .then((w) => w ?? null);
  }

  async create(customerId: string): Promise<{ id: string }> {
    const inserted = await this.db
      .insert(wallets)
      .values({
        customerId,
      })
      .returning({ id: wallets.id });

    if (inserted.length === 0) throw new InternalServerErrorException();

    return inserted[0];
  }

  async getFrozenTotal(walletId: string): Promise<number> {
    const [row] = await this.db
      .select({
        frozen: sql<number>`coalesce(sum(${freezedAmounts.amount}), 0)::bigint`,
      })
      .from(freezedAmounts)
      .where(eq(freezedAmounts.walletId, walletId));

    return Number(row?.frozen ?? 0);
  }

  increaseBalance(walletId: string, amount: number) {
    return this.db
      .update(wallets)
      .set({
        total: sql`${wallets.total} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(wallets.id, walletId))
      .returning({
        id: wallets.id,
      })
      .then((rows) => rows[0] ?? null);
  }

  async decreaseBalance(walletId: string, amount: number) {
    const frozen = sql`coalesce((
      select sum(${freezedAmounts.amount})
      from ${freezedAmounts}
      where ${freezedAmounts.walletId} = ${wallets.id}
    ), 0)::bigint`;

    return this.db
      .update(wallets)
      .set({
        total: sql`${wallets.total} - ${amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(wallets.id, walletId),
          sql`${wallets.total} - ${frozen} >= ${amount}`,
        ),
      )
      .returning({ id: wallets.id })
      .then(([row]) => row ?? null);
  }

  async freezeBalanceAmount(
    walletId: string,
    amount: number,
    reason: (typeof freezedAmounts.$inferSelect)['reason'],
  ): Promise<{ freezeId: string }> {
    return this.db
      .insert(freezedAmounts)
      .values({
        amount,
        walletId,
        reason,
      })
      .returning({ freezeId: freezedAmounts.id })
      .then((rows) => rows[0]);
  }

  releaseFrozen(freezeId: string) {
    return this.db
      .delete(freezedAmounts)
      .where(eq(freezedAmounts.id, freezeId))
      .returning({
        walletId: freezedAmounts.walletId,
        amount: freezedAmounts.amount,
        reason: freezedAmounts.reason,
      })
      .then((rows) => rows[0] ?? null);
  }

  async pageTransactions(
    customerId: string,
    { page, size, sort }: PageCriteria<typeof walletTransactions>,
  ): Promise<PageResult<WalletTransaction, OffsetPagination>> {
    const row = await this.db
      .select({ walletId: wallets.id })
      .from(wallets)
      .where(eq(wallets.customerId, customerId))
      .then(([r]) => r ?? null);

    if (!row)
      throw new NotFoundException(
        `Wallet belong the customer ${customerId} not found`,
      );

    const [transactions, [{ totalItems }]] = await Promise.all([
      this.db.query.walletTransactions.findMany({
        orderBy: orderBy(sort),
        offset: (page - 1) * size,
        where: {
          walletId: row.walletId,
        },
        limit: size,
      }),
      this.db
        .select({ totalItems: count() })
        .from(walletTransactions)
        .where(eq(walletTransactions.walletId, row.walletId)),
    ]);

    const totalPages = Math.ceil(totalItems / size);

    return {
      page: {
        items: transactions,
        number: page,
        size,
        totalItems,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  findTransactionByIdempotencyKeyAndWalletId(
    idempotencyKey: string,
    walletId: string,
  ) {
    return this.db
      .select()
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.idempotencyKey, idempotencyKey),
          eq(walletTransactions.walletId, walletId),
        ),
      )
      .then((rows) => rows['0'] ?? null);
  }

  recordTransaction(transaction: typeof walletTransactions.$inferInsert) {
    return this.db
      .insert(walletTransactions)
      .values(transaction)
      .returning({ id: walletTransactions.id })
      .then((rows) => rows[0] ?? null);
  }
}
