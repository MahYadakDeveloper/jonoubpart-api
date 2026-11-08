import {
  CashbackError,
  InsufficientCashbackBalanceError,
  type CashbackApi,
} from '@feature/cashback-api';
import {
  InvoiceItem,
  InvoiceItemBase,
  LineItems,
  Money,
  type OutboxRepository,
  type TransactionManager,
} from '@feature/shared';
import {
  ReturnSnapshot,
  SaleReturnRecordedEventPayload,
  SaleReturnRecordedEventType,
} from '@feature/pos-return-api';
import { type SaleApi } from '@feature/pos-sale-api';
import { type SettlementApi } from '@feature/settlement-api';
import { type WalletApi } from '@feature/wallet-api';
import { type WarehouseApi } from '@feature/warehouse-api';
import { Injectable } from '@nestjs/common';
import { DuplicateItemsInReturnError } from './errors/duplicate-items-in-return.error';
import { ReturnItemsDoNotMatchSaleError } from './errors/return-items-do-not-match-sale.error';
import { type ReturnRepository } from './return.repository';
import { RecordReturnRequest } from './return.req';
import { RecordReturnResponse } from './return.res';
import { ProductLineItem } from './types/product-line-item.type';
import { flattenRefundableItems } from './utils/flatten-refundable-items';

/**
 *
 */
@Injectable()
export class SaleService {
  constructor(
    private readonly repository: ReturnRepository,
    private readonly warehouse: WarehouseApi,
    private readonly cashback: CashbackApi,
    private readonly sale: SaleApi,
    private readonly settlement: SettlementApi,
    private readonly wallet: WalletApi,
    private readonly outboxRepository: OutboxRepository,
    private readonly tx: TransactionManager,
  ) {}

  /**
   * @throws {DuplicateItemsInReturnError}
   * @throws {ReturnItemsDoNotMatchSaleError}
   * @throws {InsufficientCashbackBalanceError}
   * @throws {CashbackError}
   */
  async recordReturn({
    saleId,
    cashbackReversalPolicy,
    items,
    payoff,
  }: RecordReturnRequest): Promise<RecordReturnResponse> {
    // Added transactional handling for the return workflow.
    // Currently, a failure while recording the return document after stock restoration
    // can leave the system in an inconsistent state (stock updated but return not recorded).
    return await this.tx.run(async () => {
      const { sale } = await this.sale.find({ saleId });

      items.assertUniqueBy(
        (item) => item.productId,
        (productId) => new DuplicateItemsInReturnError(productId),
      );

      const returnItems = items.toLineItems((item) => item.productId);

      const soldItems = sale.items;

      const returnSnapshotItems = returnItems.transform(
        (item) => this.computeRefundableLine(soldItems, item),
        (item) => item.productId,
      );

      const refund = returnSnapshotItems.reduce(
        (total, item) => total.add(item.lineTotal),
        Money.zero(),
      );

      const { customer } = sale.header;

      let payableRefund: Money = refund;
      let cashbackReversed = Money.zero();
      if (customer && sale.summary.cashback) {
        if (!cashbackReversalPolicy) {
          throw new Error('Cashback reversal policy is required.');
        }
        const result = await this.cashback.processCashbackReversal({
          customer,
          refundedItems: returnSnapshotItems,
          referenceId: sale.id,
          granted: sale.summary.cashback,
          policy: cashbackReversalPolicy,
        });

        switch (result.kind) {
          case 'deduct_from_refund':
            payableRefund = payableRefund.subtract(result.deductedAmount);
            break;
          case 'reversed':
            cashbackReversed = result.reversedAmount;
            break;
        }
      }

      // Tax
      if (sale.summary.tax) {
        const refundableTax = this.calculateProportionalTax(
          sale.summary.tax,
          refund,
          sale.summary.grandTotal,
        );

        payableRefund = payableRefund.subtract(refundableTax);
      }

      if (payableRefund.lt(Money.zero())) {
        throw new Error('Payable refund cannot be negative.');
      }

      const returnSnapshot: ReturnSnapshot = {
        header: sale.header,

        items: returnSnapshotItems,

        summary: {
          refund,
          payableRefund,
        },

        refund: {
          amount: payableRefund,
          cashbackReversed,
        },
      };

      const { returnId } = await this.repository.recordReturn(returnSnapshot);

      // Settlement
      if (payoff) {
        // Payoff
        await this.settlement.refund({
          customerId: customer?.id,
          amount: returnSnapshot.summary.payableRefund,
          destination: payoff.depositTo,
          referenceId: returnId,
        });
      } else {
        // Credit
        if (!customer) throw new Error('...');

        await this.wallet.deposit({
          amount: returnSnapshot.summary.payableRefund,
          customerId: customer.id,
          idempotencyKey: `return:${returnId}`,
          reason: 'refund',
          referenceId: returnId,
        });
      }

      // Warehouse
      await this.warehouse.receiveCustomerReturn({
        returnId,
        items: returnSnapshotItems.transform(
          (item) => ({
            goodId: item.productId,
            quantity: item.quantity,
          }),
          (item) => item.goodId,
        ),
      });

      await this.outboxRepository.save({
        type: SaleReturnRecordedEventType,
        payload: {
          snapshot: returnSnapshot,
        } satisfies SaleReturnRecordedEventPayload,
      });

      return {
        returnId: returnId,
      };
    });
  }

  private calculateProportionalTax(
    tax: Money,
    refund: Money,
    invoiceTotal: Money,
  ): Money {
    const ratio = refund.value / invoiceTotal.value;

    return tax.multiply(ratio);
  }

  private computeRefund(
    returnItems: LineItems<ProductLineItem>,
    soldItems: LineItems<InvoiceItem>,
  ): Money {
    const refundableItems = flattenRefundableItems(soldItems);

    let refund = Money.zero();

    for (const returnItem of returnItems) {
      const refundableItem = refundableItems.getOrThrow(
        returnItem.productId,
        () => new ReturnItemsDoNotMatchSaleError(),
      );

      if (returnItem.quantity > refundableItem.quantity)
        throw new ReturnItemsDoNotMatchSaleError();

      // Discount given is considered
      refund = refund.add(
        refundableItem.lineTotal
          .divide(refundableItem.quantity)
          .multiply(returnItem.quantity),
      );
    }
    return refund;
  }

  private computeRefundableLine(
    soldItems: LineItems<InvoiceItem>,
    item: ProductLineItem,
  ): InvoiceItemBase {
    const refundableItem = flattenRefundableItems(soldItems).getOrThrow(
      item.productId,
      () => new ReturnItemsDoNotMatchSaleError(),
    );

    if (item.quantity > refundableItem.quantity) {
      throw new ReturnItemsDoNotMatchSaleError();
    }

    return {
      ...item,
      description: refundableItem.description,
      unitPrice: refundableItem.unitPrice,
      lineTotal: refundableItem.lineTotal
        .divide(refundableItem.quantity)
        .multiply(item.quantity),
    };
  }
}
