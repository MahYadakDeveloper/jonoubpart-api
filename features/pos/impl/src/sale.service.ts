import { type CashbackApi } from '@feature/cashback-api';
import { type CatalogApi } from '@feature/catalog-api';
import {
  AppliedDiscount,
  InvoiceSnapshot,
  LineItems,
  type OutboxRepository,
  type TransactionManager,
} from '@feature/shared';
import { type DiscountApi } from '@feature/discount-api';
import { PlanPaymentRequest, type PaymentApi } from '@feature/payment-api';
import {
  FindSaleRequest,
  FindSaleResponse,
  SaleApi,
  SaleRecordedEventPayload,
  SaleRecordedEventType,
} from '@feature/pos-sale-api';
import { type PricingApi } from '@feature/pricing-api';
import { type TaxApi } from '@feature/tax-api';
import { type WarehouseApi } from '@feature/warehouse-api';
import { Injectable } from '@nestjs/common';
import { DuplicateItemsInSaleError } from './errors/duplicate-items-in-sale.error';
import { type SaleRepository } from './sale.repository';
import { RecordSaleRequest } from './sale.requests';
import { flattenInvoiceItems } from './utils/flatten-invoice-item';
import { mapProductToUnpricedInvoiceItem } from './utils/product-to-unpriced-invoice-item.mapper';

/**
 *
 */
@Injectable()
export class SaleService implements SaleApi {
  constructor(
    private readonly repository: SaleRepository,
    private readonly warehouse: WarehouseApi,
    private readonly pricing: PricingApi,
    private readonly payment: PaymentApi,
    private readonly discount: DiscountApi,
    private readonly cashback: CashbackApi,
    private readonly catalog: CatalogApi,
    private readonly tax: TaxApi,
    private readonly outboxRepository: OutboxRepository,
    private readonly tx: TransactionManager,
  ) {}

  async find({ saleId }: FindSaleRequest): Promise<FindSaleResponse> {
    const sale = await this.repository.findById(saleId);
    return {
      sale: {
        id: sale.id,
        invoiceNumber: sale.invoiceNumber.value,
        ...sale.snapshot,
      },
    };
  }

  /**
   *
   *
   */
  async recordSale(req: RecordSaleRequest) {
    await this.tx.run(async () => {
      // Uniqueness validation
      req.items.assertUniqueBy(
        (x) => x.productId,
        (key) => new DuplicateItemsInSaleError(key),
      );

      const requestedItems = req.items.toLineItems((item) => item.productId);

      const { products } = await this.catalog.findMany({
        productIds: [...requestedItems.keys()],
      });

      const unpricedInvoiceItems = products.transform(
        (product) =>
          mapProductToUnpricedInvoiceItem(
            product,
            requestedItems.getOrThrow(product.id).qty,
          ),
        (product) => product.productId,
      );

      // Pricing invoice
      const { pricedInvoice: invoice } = await this.pricing.priceInvoice({
        customer: req.customer,
        items: unpricedInvoiceItems,
      });

      // Processing payment
      const paymentRequest: PlanPaymentRequest = req.customer?.id
        ? {
            customerId: req.customer?.id,
            amountDue: invoice.summary.grandTotal,
            useWallet: req.useWallet,
          }
        : {
            amountDue: invoice.summary.grandTotal,
          };

      const { payment } = await this.payment.planPayment(paymentRequest);

      // Tax
      const { tax } = await this.tax.calculateTax({
        paymentAmount: invoice.summary.grandTotal,
      });

      // Calculating granting cashback customer for preview
      const { cashback: cashbackPreview } = req.customer
        ? await this.cashback.calculate({
            customer: req.customer,
            purchasedItems: invoice.items,
          })
        : { cashback: undefined };

      const snapshot: InvoiceSnapshot = {
        header: {
          cashierId: req.cashierId,
          customer: req.customer,
          issuedAt: new Date(Date.now()),
        },
        items: invoice.items,
        summary: { ...invoice.summary, cashback: cashbackPreview, tax },
        payment,
      };

      const { saleId } = await this.repository.recordSale(snapshot);

      if (req.customer?.id)
        await this.cashback.grant({
          customer: req.customer,
          purchasedItems: invoice.items,
          referenceId: saleId,
          expectedCashback: cashbackPreview!,
        });

      // Issuing goods
      const flattenedItems = flattenInvoiceItems(invoice.items);
      await this.warehouse.issueGoods({
        reference: {
          source: 'pos-sale',
          id: saleId,
        },
        items: flattenedItems.transform(
          (item) => ({ goodId: item.productId, quantity: item.quantity }),
          (item) => item.goodId,
        ),
      });

      // Commit discount usages
      if (req.customer) {
        const appliedDiscounts = snapshot.items.reduce(
          (discounted, item) => {
            if (!item.discount) return discounted;

            return discounted.set(item.discount);
          },
          new LineItems<AppliedDiscount>((x) => x.source.id),
        );

        await this.discount.commitDiscountUsages({
          customer: req.customer,
          appliedDiscounts,
        });
      }

      await this.outboxRepository.save({
        type: SaleRecordedEventType,
        payload: {
          snapshot,
        } satisfies SaleRecordedEventPayload,
      });
    });
  }

  // private calculateProportionalTax(tax: Money, refund: Money, invoiceTotal: Money): Money {
  //   const ratio = refund.value / invoiceTotal.value;

  //   return tax.multiply(ratio);
  // }

  // private computeRefund(
  //   returnItems: LineItems<ProductLineItem>,
  //   soldItems: LineItems<InvoiceItem>,
  // ): Money {
  //   const refundableItems = flattenRefundableItems(soldItems);

  //   let refund = Money.zero();

  //   for (const returnItem of returnItems) {
  //     const refundableItem = refundableItems.getOrThrow(
  //       returnItem.productId,
  //       () => new ReturnItemsDoNotMatchSaleError(),
  //     );

  //     if (returnItem.quantity > refundableItem.quantity) throw new ReturnItemsDoNotMatchSaleError();

  //     // Discount given is considered
  //     refund = refund.add(
  //       refundableItem.lineTotal.divide(refundableItem.quantity).multiply(returnItem.quantity),
  //     );
  //   }
  //   return refund;
  // }

  // private computeRefundableLine(
  //   soldItems: LineItems<InvoiceItem>,
  //   item: ProductLineItem,
  // ): InvoiceItemBase {
  //   const refundableItem = flattenRefundableItems(soldItems).getOrThrow(
  //     item.productId,
  //     () => new ReturnItemsDoNotMatchSaleError(),
  //   );

  //   if (item.quantity > refundableItem.quantity) {
  //     throw new ReturnItemsDoNotMatchSaleError();
  //   }

  //   return {
  //     ...item,
  //     description: refundableItem.description,
  //     unitPrice: refundableItem.unitPrice,
  //     lineTotal: refundableItem.lineTotal.divide(refundableItem.quantity).multiply(item.quantity),
  //   };
  // }
}
