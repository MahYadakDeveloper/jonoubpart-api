import {
  CalculateCashbackRequest,
  CalculateCashbackResponse,
  CashbackApi,
  CashbackReversalPolicy,
  GrantingCashbackRequest,
  GrantingCashbackResponse,
  ReversalCashbackRequest,
  ReversalCashbackResponse,
} from '@feature/cashback-api';
import {
  CustomerType,
  GrantedCashback,
  InvoiceItem,
  LineItems,
  Money,
} from '@feature/shared';
import { type WalletApi } from '@feature/wallet-api';
import { Injectable } from '@nestjs/common';
import {
  CashbackAmountChangedError,
  InvalidCashbackRateError,
} from './cashback.errors';
import { type CashbackSettingsRepository } from './repository/cashback-settings.repository';

@Injectable()
export class CashbackService implements CashbackApi {
  constructor(
    private readonly cashbackSettings: CashbackSettingsRepository,
    private readonly wallet: WalletApi,
  ) {}

  async calculate({
    customer,
    purchasedItems,
  }: CalculateCashbackRequest): Promise<CalculateCashbackResponse> {
    return {
      cashback: await this.resolveGrantedCashback(
        customer.type,
        purchasedItems,
      ),
    };
  }

  async grant({
    customer,
    referenceId,
    purchasedItems,
    expectedCashback,
  }: GrantingCashbackRequest): Promise<GrantingCashbackResponse> {
    const granted = await this.resolveGrantedCashback(
      customer.type,
      purchasedItems,
    );

    if (
      expectedCashback.appliedRate !== granted.appliedRate ||
      !expectedCashback.amount.equals(granted.amount)
    ) {
      throw new CashbackAmountChangedError({
        expected: expectedCashback,
        actual: granted,
      });
    }

    if (granted.amount.isZero()) {
      return { grantedCashback: this.emptyCashback() };
    }

    await this.wallet.deposit({
      customerId: customer.id,
      amount: granted.amount,
      reason: 'cashback',
      referenceId,
      idempotencyKey: `cashback:${referenceId}`,
    });

    return {
      grantedCashback: granted,
    };
  }

  async processCashbackReversal({
    customer,
    refundedItems,
    referenceId,
    granted,
    policy,
  }: ReversalCashbackRequest): Promise<ReversalCashbackResponse> {
    const eligibleRefundAmount =
      this.resolveCashbackEligibleAmount(refundedItems);

    const reversalCashback = this.calculateCashback(
      granted.appliedRate,
      eligibleRefundAmount,
    );

    switch (policy) {
      case CashbackReversalPolicy.DeductFromRefund:
        return {
          kind: 'deduct_from_refund',
          deductedAmount: reversalCashback,
        };

      case CashbackReversalPolicy.ReverseGrantedCashback:
        if (!reversalCashback.isZero()) {
          await this.revokeCashback(customer.id, referenceId, reversalCashback);
        }
        await this.revokeCashback(customer.id, referenceId, reversalCashback);

        return {
          kind: 'reversed',
          reversedAmount: reversalCashback,
        };
    }
  }

  private async resolveGrantedCashback(
    customerType: CustomerType,
    purchasedItems: LineItems<InvoiceItem>,
  ): Promise<GrantedCashback> {
    if (customerType === 'merchant') {
      return this.emptyCashback();
    }

    const policy = await this.cashbackSettings.getPolicy(customerType);

    if (!policy.enabled) {
      return this.emptyCashback();
    }

    const eligibleAmount = this.resolveCashbackEligibleAmount(purchasedItems);

    return {
      appliedRate: policy.rate,
      amount: this.calculateCashback(policy.rate, eligibleAmount),
    };
  }

  private resolveCashbackEligibleAmount<
    T extends {
      lineTotal: Money;
      discount?: { totalDiscount: Money };
    },
  >(items: LineItems<T>): Money {
    return items.reduce((total, item) => {
      if (item.discount?.totalDiscount.gt(Money.zero())) return total;
      return total.add(item.lineTotal);
    }, Money.zero());
  }

  private calculateCashback(rate: number, amount: Money): Money {
    if (rate < 0 || rate > 1) {
      throw new InvalidCashbackRateError(rate);
    }

    return amount.multiply(rate);
  }

  private async revokeCashback(
    customerId: string,
    referenceId: string,
    cashback: Money,
  ): Promise<void> {
    await this.wallet.withdraw({
      customerId,
      amount: cashback,
      reason: 'cashback_reversal',
      referenceId,
      idempotencyKey: `cashback-reversal:${referenceId}`,
    });
  }

  private emptyCashback(): GrantedCashback {
    return {
      appliedRate: 0,
      amount: Money.zero(),
    };
  }
}
