import { StrictOmit } from '@feature/shared/types/utils';
import { assertOne } from '@feature/shared/utils/assertions';
import { DrizzleBaseRepository } from '@infra/db-drizzle';
import {
  actorsRelations,
  freezedAmounts,
  wallets,
  walletTransactionReason,
  walletTransactions,
  walletTransactionType,
} from '@infra/db-drizzle/schema';
import {
  and,
  DBQueryConfigOrderBy,
  DBQueryConfigWith,
  eq,
  sql,
} from 'drizzle-orm';

/**
 * Wallet repository contract.
 *
 * Rules:
 * - Every mutating method runs: lock wallet row (SELECT ... FOR UPDATE)
 *   -> idempotency check -> validate -> update balance -> insert ledger row
 *   -> (freeze rows) -> all inside ONE db transaction.
 * - No generic update/delete: balance only changes through these methods.
 * - Replayed idempotency key => returns the original result with replayed=true.
 *   Same key with a different payload => IdempotencyConflictError.
 */

export type WalletTxReason =
  (typeof walletTransactionReason.enumValues)[number];
export type WalletTxType = (typeof walletTransactionType.enumValues)[number];
export type WalletTransaction = typeof walletTransactions.$inferSelect;

export interface WalletBalance {
  available: number;
  frozen: number; // SUM(amount) of active freezes
  total: number; // available + frozen
}

interface CreditMovement extends StrictOmit<
  typeof walletTransactions.$inferSelect,
  | 'id'
  | 'adjustedBy'
  | 'walletId'
  | 'createdAt'
  | 'freezedAmountId'
  | 'type'
  | 'availableBalanceAfter'
> {}

export interface MoveCommand extends WalletTxData {
  amount: number; // > 0
}

/** commit/unfreeze take no amount: the whole hold is settled. */
export interface SettleFreezeCommand {
  freezeId: string;
}

export interface MovementResult {
  transaction: WalletTransaction;
  replayed: boolean;
}

export interface FreezeResult extends MovementResult {
  freeze: typeof freezedAmounts.$inferSelect;
}

export interface ListTransactionsQuery {
  walletId: string;
  types?: WalletTxType[];
  reasons?: WalletTxReason[];
  reference?: { type: string; id?: string };
  cursor?: string; // keyset on (createdAt desc, id)
  limit?: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

const withFreezed = {
  freezedAmounts: {
    columns: {
      id: false,
      settledAt: false,
      walletId: false,
      status: false,
    },
    orderBy: {
      createdAt: 'desc',
    },
  },
} satisfies DBQueryConfigWith<
  typeof actorsRelations,
  typeof actorsRelations.wallets.relations
>;

export class WalletRepository extends DrizzleBaseRepository<
  typeof actorsRelations
> {
  findById(id: string) {
    this.ranForUpdate ? 
    return this.db.query.wallets.findFirst({
      where: {
        id,
      },
      with: { ...withFreezed },
    });
  }

  findByCustomerId(customerId: string) {
    this.db.query.wallets.findFirst({
      where: {
        customerId,
      },
      with: { ...withFreezed },
    });
  }

  async getBalance(id: string): Promise<WalletBalance> {
    const query = this.db
      .select({
        available: wallets.availableBalance,
        frozen: sql<number>`coalesce(sum(${freezedAmounts.amount}), 0)`.mapWith(
          Number,
        ),
      })
      .from(wallets)
      .leftJoin(
        freezedAmounts,
        and(
          eq(freezedAmounts.walletId, wallets.id),
          sql`${freezedAmounts.status} = 'active'`,
        ),
      )
      .where(eq(wallets.id, id))
      .groupBy(wallets.id);

    const rows = await (this.forUpdateCtx.getStore() === 'for_update'
      ? query.for('update')
      : query);

    assertOne(rows, () => new WalletNotFoundError());

    const [balance] = rows;

    return {
      ...balance,
      total: balance.available + balance.frozen,
    };
  }

  findFreezeById(walletId: string, freezeId: string) {}
  listActiveFreezes(walletId: string) {}

  findTransactionByIdempotencyKey(walletId: string, idempotencyKey: string) {}

  listTransactions(
    q: ListTransactionsQuery,
  ): Promise<Page<WalletTransaction>> {}

  findTransactionsByReference(
    referenceType: string,
    referenceId: string,
  ): Promise<WalletTransaction[]> {}

  /* ---- movements (each atomic + idempotent) ---- */
  credit(walletId: string, movement: CreditMovement): Promise<MovementResult> {
    this.db.query.addresses.findFirst({
      orderBy: {
        id: 'asc',
      },
    });
    return this.dbProvider.current(async () => {
      await this.lock('wallet', `credit:${idempotencyKey}`);

      const walletTx = await this.db.query.walletTransactions.findFirst({
        where: {
          idempotencyKey,
        },
      });

      if (walletTx) {
        if (
          walletTx.type !== 'credit' ||
          walletTx.amount !== amount ||
          walletTx.reason !== reason
        )
          throw new IdempotencyConflictError(
            'Idempotency key reused with a different payload',
          );

        return walletTx;
      }
    });
  }

  /** Throws InsufficientBalanceError. */
  debit(cmd: MoveCommand): Promise<MovementResult> {}

  /** available -= amount, creates an active hold. Throws InsufficientBalanceError. */
  freeze(cmd: MoveCommand): Promise<FreezeResult> {}

  /** Spends the whole hold; available unchanged. Throws FreezeNotActiveError. */
  commitFreeze(cmd: SettleFreezeCommand): Promise<FreezeResult> {}

  /** Returns the whole hold to available. Throws FreezeNotActiveError. */
  unfreeze(cmd: SettleFreezeCommand): Promise<FreezeResult> {}
}

export class WalletNotFoundError extends Error {}
export class FreezeNotFoundError extends Error {}
export class FreezeNotActiveError extends Error {}
export class InsufficientBalanceError extends Error {}
export class IdempotencyConflictError extends Error {}

const x: DBQueryConfigOrderBy<typeof wallets, typeof wallets._.columns> = {
  id: 'asc',
};
