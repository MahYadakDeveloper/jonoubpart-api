import {
  GetWalletBalanceInput,
  WalletApi,
  WalletBalanceResult,
  WalletCommitFreezeInput,
  WalletCreditInput,
  WalletDebitInput,
  WalletFreezeInput,
  WalletFreezeResult,
  WalletReleaseFreezeInput,
  WalletTransactionResult,
} from '@feature/actors-api/customer';
import { assertFound } from '@feature/shared/utils/assertions';
import { DrizzleTransactionContext } from '@infra/db-drizzle';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { WalletRepository, WalletTransaction } from './wallet.repository';

@Injectable()
export class WalletService implements WalletApi {
  constructor(
    private readonly repository: WalletRepository,
    private readonly tx: DrizzleTransactionContext,
  ) {}

  credit(input: WalletCreditInput): Promise<WalletTransactionResult> {
    return this.runIdempotently('deposit', input, (walletId, amount) =>
      this.repository.increaseBalance(walletId, amount),
    );
  }

  debit(input: WalletDebitInput): Promise<WalletTransactionResult> {
    return this.runIdempotently('withdraw', input, (walletId, amount) =>
      this.repository.decreaseBalance(walletId, amount),
    );
  }

  freeze({
    amount,
    customerId,
    idempotencyKey,
    reason,
  }: WalletFreezeInput): Promise<WalletFreezeResult> {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be a positive integer');
    }

    return this.tx.run(async () =>
      this.repository.withLock(
        'wallet-transaction',
        idempotencyKey,
        async () => {
          const wallet = await this.repository.findByCustomerId(customerId);
          assertFound(
            wallet,
            () => new NotFoundException('Customer has no wallet!'),
          );

          const existing =
            await this.repository.findTransactionByIdempotencyKeyAndWalletId(
              idempotencyKey,
              wallet.id,
            );

          if (existing) {
            existing.type;
            assertIdempotentReplay({});

            if (!existing.freezedAmountId)
              throw new InternalServerErrorException();

            return {
              freezeId: existing.freezedAmountId,
            };
          }

          const { freezeId } = await this.repository.freezeBalanceAmount(
            wallet.id,
            amount,
            reason,
          );

          await this.repository.recordTransaction({
            type: 'freeze',
            walletId: wallet.id,
            idempotencyKey,
            amount,
            reason,
            description,
            freezedAmountId: freezeId,
          });

          return { freezeId };
        },
      ),
    );
  }

  commitFreeze({
    customerId,
    freezeId,
    idempotencyKey,
    note,
  }: WalletCommitFreezeInput): Promise<WalletTransactionResult> {
    return this.tx.run(async () =>
      this.repository.withLock(
        'wallet-transaction',
        idempotencyKey,
        async () => {
          const wallet = await this.repository.findByCustomerId(customerId);
          if (!wallet) throw new NotFoundException('Wallet not found!');

          const existing =
            await this.repository.findTransactionByIdempotencyKeyAndWalletId(
              idempotencyKey,
              wallet.id,
            );

          if (existing) {
            if (existing.type !== 'withdraw') {
              throw new ConflictException(
                'Idempotency key reused with a different payload',
              );
            }

            return { transactionId: existing.id };
          }

          const frozen = await this.repository.releaseFrozen(freezeId);
          if (!frozen) {
            throw new NotFoundException('Frozen amount not found');
          }

          if (wallet.id !== frozen.walletId)
            throw new BadRequestException('The frozen id is invalided');

          const updated = await this.repository.decreaseBalance(
            wallet.id,
            frozen.amount,
          );

          if (!updated)
            throw new UnprocessableEntityException('Insufficient funds');

          const { id: transactionId } = await this.repository.recordTransaction(
            {
              type: 'withdraw',
              amount: frozen.amount,
              walletId: frozen.walletId,
              idempotencyKey,
              reason: frozen.reason,
            },
          );

          return { transactionId };
        },
      ),
    );
  }

  releaseFreeze(input: WalletReleaseFreezeInput): Promise<WalletFreezeResult> {
    return this.tx.run(async () =>
      this.repository.withLock(
        'wallet-transaction',
        idempotencyKey,
        async () => {
          const frozen = await this.repository.releaseFrozen(freezeId);
          if (!frozen) return;

          const existing =
            await this.repository.findTransactionByIdempotencyKeyAndWalletId(
              idempotencyKey,
              frozen.walletId,
            );

          if (existing) return;

          await this.repository.recordTransaction({
            type: 'unfreeze',
            amount: frozen.amount,
            walletId: frozen.walletId,
            idempotencyKey,
            reason: frozen.reason,
          });
        },
      ),
    );
  }

  pageTransactions(
    customerId: string,
    criteria: Parameters<WalletRepository['pageTransactions']>[1],
  ) {
    return this.repository.pageTransactions(customerId, criteria);
  }

  async getBalance({
    customerId,
  }: GetWalletBalanceInput): Promise<WalletBalanceResult> {
    const wallet = await this.repository.findByCustomerId(customerId);
    if (!wallet) throw new NotFoundException('Customer has no wallet!');

    const frozen = await this.repository.getFrozenTotal(wallet.id);
    return {
      total: wallet.total,
      frozen,
      available: wallet.total - frozen,
    };
  }

  async payout(customerId: string, { amount }: { amount: number }) {}

  private runIdempotently(
    type: Extract<WalletTransaction['type'], 'withdraw' | 'deposit'>,
    {
      customerId,
      amount,
      idempotencyKey,
      reason,
      description,
    }: WalletDepositRequest | WalletWithdrawRequest,
    applyBalance: (
      walletId: string,
      amount: number,
    ) => Promise<{ id: string } | null>,
  ): Promise<WalletTransactionResponse> {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be a positive integer');
    }

    return this.tx.run(async () =>
      this.repository.withLock(
        'wallet-transaction',
        idempotencyKey,
        async () => {
          const wallet = await this.repository.findByCustomerId(customerId);
          if (!wallet) throw new NotFoundException('Customer has no wallet!');

          const existing =
            await this.repository.findTransactionByIdempotencyKeyAndWalletId(
              idempotencyKey,
              wallet.id,
            );

          if (existing) {
            if (existing.type !== type || existing.amount !== amount) {
              throw new ConflictException(
                'Idempotency key reused with a different payload',
              );
            }
            return { transactionId: existing.id };
          }

          const { id: transactionId } = await this.repository.recordTransaction(
            {
              type,
              walletId: wallet.id,
              idempotencyKey,
              amount,
              reason,
              description,
            },
          );

          const updated = await applyBalance(wallet.id, amount);
          if (!updated)
            switch (type) {
              case 'withdraw':
                throw new UnprocessableEntityException('Insufficient funds');
              case 'deposit':
                throw new NotFoundException('Customer has no wallet!');
            }

          return { transactionId };
        },
      ),
    );
  }
}

function assertIdempotentReplay(
  existing: { type: string; amount: number; reason: string },
  expected: {
    type: 'freeze' | 'credit' | 'debit' | 'commit_freeze';
    amount: number;
    reason: string;
  },
): void {
  if (
    existing.type !== expected.type ||
    existing.amount !== expected.amount ||
    existing.reason !== expected.reason
  ) {
    throw new ConflictException(
      'Idempotency key reused with a different payload',
    );
  }
}
