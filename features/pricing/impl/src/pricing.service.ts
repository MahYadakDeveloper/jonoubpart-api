import { type CatalogApi } from '@feature/catalog-api';
import {
  AppliedDiscount,
  CustomerType,
  InvoiceItem,
  InvoiceSummary,
  LineItems,
  Money,
  RawProduct,
} from '@feature/shared';
import {
  ApplicableCampaignDiscount,
  ApplicableDiscount,
  ApplicableSpecificDiscount,
  type DiscountApi,
} from '@feature/discount-api';
import {
  InvoicePricingRequest,
  InvoicePricingResponse,
  ManyProductPricingRequest,
  ManyProductPricingResponse,
  PricingApi,
  ProductPricingRequest,
  ProductPricingResponse,
  UnpricedBundleInvoiceItem,
  UnpricedProductInvoiceItem,
} from '@feature/pricing-api';
import { MarkupDto, type MarkupPolicyApi } from '@feature/pricing-markup-api';
import { type ProcurementApi } from '@feature/procurement-api';
import { Injectable } from '@nestjs/common';
import { ProductNotFoundError } from './errors/product-not-found-error';
import { PurchasePriceNotFoundError } from './errors/purchase-price-not-found.error';
import { BundleComponentInvoiceItem } from './model/bundle-component-invoice-item';

@Injectable()
export class PricingService implements PricingApi {
  constructor(
    private readonly markupPolicy: MarkupPolicyApi,
    private readonly discount: DiscountApi,
    private readonly catalog: CatalogApi,
    private readonly procurement: ProcurementApi,
  ) {}

  private resolvePolicy(customerType: CustomerType) {
    return customerType === 'merchant' ? 'wholesale' : 'retail';
  }

  async priceProduct({
    productId,
    policy,
  }: ProductPricingRequest): Promise<ProductPricingResponse> {
    const { prices } = await this.priceManyProduct({
      productIds: [productId],
      policy,
    });

    return {
      price: prices.getOrThrow(productId).price,
    };
  }

  // TODO Note this is not complete yet, complete it then
  async priceManyProduct({
    productIds,
    policy,
  }: ManyProductPricingRequest): Promise<ManyProductPricingResponse> {
    // products
    const { products } = await this.catalog.getRawProducts({ productIds });

    for (const productId of productIds) {
      if (!products.has(productId)) throw new ProductNotFoundError(productId);
    }

    const leafGoodIds = this.collectLeafGoodIds(products);
    const { prices: leafPurchasePrices } =
      await this.procurement.findManyPurchasePrice({
        goodIds: leafGoodIds,
      });

    const leafProductIds = this.collectLeafProductIds(products);
    const { markups } = await this.markupPolicy.resolveMany({
      productIds: leafProductIds,
      policy,
    });

    const prices = new LineItems<{
      productId: string;
      price: Money;
    }>((item) => item.productId);

    for (const product of products) {
      if (product.kind === 'leaf') {
        const price = this.calculateUnitPrice(
          leafPurchasePrices.getOrThrow(
            product.goodId,
            (id) => new PurchasePriceNotFoundError(id),
          ).price,
          markups.getOrThrow(product.id).rate,
        );
        prices.set({ productId: product.id, price });
        continue;
      }

      const bundle = product;
      const price = bundle.items.reduce((bundlePrice, item) => {
        const purchasePrice = leafPurchasePrices.getOrThrow(
          item.goodId,
          (id) => new PurchasePriceNotFoundError(id),
        ).price;

        return bundlePrice.add(
          this.calculateUnitPrice(
            purchasePrice,
            markups.getOrThrow(item.productId).rate,
          ).multiply(item.quantity),
        );
      }, Money.zero());

      prices.set({ productId: product.id, price });
    }

    return { prices };
  }

  async priceInvoice({
    items,
    customer,
  }: InvoicePricingRequest): Promise<InvoicePricingResponse> {
    // Getting products
    const { products } = await this.catalog.getRawProducts({
      productIds: [...items.keys()],
    });
    for (const item of items) {
      if (!products.has(item.productId)) {
        throw new ProductNotFoundError(item.productId);
      }
    }

    // Resolving purchase prices
    const leafGoodsIds = this.collectLeafGoodIds(products);
    const { prices: purchasePrices } =
      await this.procurement.findManyPurchasePrice({
        goodIds: leafGoodsIds,
      });

    // Resolving markup
    const policy = this.resolvePolicy(customer?.type ?? 'consumer');
    const leafProductIds = this.collectLeafProductIds(products);
    const { markups } = await this.markupPolicy.resolveMany({
      productIds: leafProductIds,
      policy: policy,
    });

    const discounts = customer
      ? (
          await this.discount.findManyApplicableDiscount({
            customer,
            productIds: [...items.keys()],
          })
        ).discounts
      : undefined;

    // Pricing items
    const pricedInvoiceItems = new LineItems<InvoiceItem>((x) => x.productId);
    for (const item of items) {
      const discount = discounts?.get(item.productId)?.discount;
      pricedInvoiceItems.set(
        item.kind === 'bundle'
          ? this.priceBundleInvoiceItem(item, purchasePrices, markups, discount)
          : this.priceProductInvoiceItem(
              item,
              purchasePrices,
              markups.getOrThrow(item.productId).rate,
              discount,
            ),
      );
    }

    const summary: InvoiceSummary = pricedInvoiceItems.reduce<InvoiceSummary>(
      (summary, item) => {
        const discount = item.discount
          ? (summary.discount ?? Money.zero()).add(item.discount.totalDiscount)
          : summary.discount;

        return {
          grandTotal: summary.grandTotal.add(item.lineTotal),
          subtotal: summary.subtotal.add(
            item.unitPrice.multiply(item.quantity),
          ),
          discount,
        };
      },
      {
        grandTotal: Money.zero(),
        subtotal: Money.zero(),
      },
    );

    return {
      pricedInvoice: { items: pricedInvoiceItems, summary },
    };
  }

  private priceProductInvoiceItem(
    item: UnpricedProductInvoiceItem,
    purchasePrices: LineItems<{ goodId: string; price: Money }>,
    markupRate: number,
    discount?: ApplicableDiscount,
  ): InvoiceItem {
    const purchasePrice = purchasePrices.getOrThrow(
      item.productId,
      (id) => new PurchasePriceNotFoundError(id),
    ).price;

    // This may unit price may consist of real price plus fake discount
    const realUnitPrice = this.calculateUnitPrice(purchasePrice, markupRate);
    const displayUnitPrice = this.calculateDisplayPrice(
      realUnitPrice,
      discount,
    );
    const appliedDiscount = this.applyDiscount(
      displayUnitPrice,
      item.quantity,
      discount,
    );
    const lineTotal = displayUnitPrice
      .multiply(item.quantity)
      .subtract(appliedDiscount?.totalDiscount ?? Money.zero());
    return {
      ...item,
      unitPrice: displayUnitPrice,
      discount: appliedDiscount,
      lineTotal,
    };
  }

  private priceBundleInvoiceItem(
    item: UnpricedBundleInvoiceItem,
    purchasePrices: LineItems<{ goodId: string; price: Money }>,
    markups: LineItems<MarkupDto>,
    discount?: ApplicableDiscount,
  ): InvoiceItem {
    const pricedBundleItems = new LineItems<BundleComponentInvoiceItem>(
      (x) => x.productId,
    );

    for (const bundleItem of item.items) {
      const purchasePrice = purchasePrices.getOrThrow(
        bundleItem.productId,
        (id) => new PurchasePriceNotFoundError(id),
      ).price;

      const realUnitPrice = this.calculateUnitPrice(
        purchasePrice,
        markups.getOrThrow(bundleItem.productId).rate,
      );
      const lineTotal = realUnitPrice.multiply(bundleItem.quantity);
      pricedBundleItems.set({
        ...bundleItem,
        unitPrice: realUnitPrice,
        lineTotal,
      });
    }

    // Calculate displayed component prices while preserving bundle displayed price
    const displayPricedBundleItems = !!discount
      ? this.calculateBundleDisplayItems(pricedBundleItems, discount)
      : pricedBundleItems;

    const displayUnitPrice = displayPricedBundleItems.reduce(
      (total, bundleItem) => {
        return total.add(bundleItem.lineTotal);
      },
      Money.zero(),
    );

    // Applying discount
    const appliedDiscount = this.applyDiscount(
      displayUnitPrice,
      item.quantity,
      discount,
    );

    const lineTotal = displayUnitPrice
      .multiply(item.quantity)
      .subtract(appliedDiscount?.totalDiscount ?? Money.zero());

    return {
      ...item,
      items: [...displayPricedBundleItems.toArray()],
      unitPrice: displayUnitPrice,
      discount: appliedDiscount,
      lineTotal,
    };
  }

  private applyDiscount(
    price: Money,
    quantity: number,
    discount?: ApplicableDiscount,
  ) {
    return discount
      ? discount.kind === 'campaign'
        ? this.applyCampaignDiscount(price, discount, quantity)
        : this.applySpecificDiscount(discount, quantity)
      : undefined;
  }

  private applySpecificDiscount(
    discount: ApplicableSpecificDiscount,
    quantity: number,
  ): AppliedDiscount {
    const discountedQuantity =
      discount.applicableQuantity === 'unlimited'
        ? quantity
        : Math.min(discount.applicableQuantity, quantity);
    return {
      source: {
        id: discount.id,
        isLimited: discount.applicableQuantity !== 'unlimited',
      },
      discountPerUnit: discount.displayDiscountPerUnit,
      discountedQuantity,
      totalDiscount:
        discount.displayDiscountPerUnit.multiply(discountedQuantity),
    };
  }

  private applyCampaignDiscount(
    price: Money,
    discount: ApplicableCampaignDiscount,
    quantity: number,
  ): AppliedDiscount {
    const discountPerUnit = price.multiply(discount.displayDiscountRate);
    const discountedQuantity =
      discount.applicableQuantity === 'unlimited'
        ? quantity
        : Math.min(discount.applicableQuantity, quantity);

    return {
      source: {
        id: discount.id,
        isLimited: discount.applicableQuantity !== 'unlimited',
      },
      discountPerUnit,
      discountedQuantity,
      totalDiscount: discountPerUnit.multiply(discountedQuantity),
    };
  }

  private calculateUnitPrice(purchasePrice: Money, markupRate: number): Money {
    return purchasePrice.multiply(1 + markupRate);
  }

  private calculateDisplayPrice(
    realPrice: Money,
    discount?: ApplicableDiscount,
  ): Money {
    if (!discount) return realPrice;

    switch (discount.kind) {
      case 'campaign': {
        const priceFactor =
          (1 - discount.realDiscountRate) / (1 - discount.displayDiscountRate);

        return realPrice.multiply(priceFactor);
      }

      case 'specific': {
        const fakeDiscount = discount.displayDiscountPerUnit.subtract(
          discount.realDiscountPerUnit,
        );

        return realPrice.add(fakeDiscount);
      }
    }
  }

  private calculateBundleDisplayItems(
    items: LineItems<BundleComponentInvoiceItem>,
    discount: ApplicableDiscount,
  ): LineItems<BundleComponentInvoiceItem> {
    const realBundlePrice = items.reduce(
      (total, item) => total.add(item.lineTotal),
      Money.zero(),
    );

    const displayBundlePrice = this.calculateDisplayPrice(
      realBundlePrice,
      discount,
    );

    const adjustment = displayBundlePrice.subtract(realBundlePrice);

    return items.transform(
      (item) => {
        const ratio = item.lineTotal.divide(realBundlePrice.value).value;

        const displayAdjustment = adjustment.multiply(ratio);

        const displayUnitPrice = item.unitPrice.add(
          displayAdjustment.divide(item.quantity),
        );

        return {
          ...item,
          unitPrice: displayUnitPrice,
          lineTotal: displayUnitPrice.multiply(item.quantity),
        };
      },
      (item) => item.productId,
    );
  }

  private collectLeafProductIds(products: Iterable<RawProduct>): string[] {
    const ids: string[] = [];

    for (const product of products) {
      if (product.kind === 'bundle') {
        for (const item of product.items) {
          ids.push(item.productId);
        }
      } else {
        ids.push(product.id);
      }
    }

    return ids;
  }

  private collectLeafGoodIds(products: Iterable<RawProduct>): string[] {
    const ids: string[] = [];

    for (const product of products) {
      if (product.kind === 'bundle') {
        for (const item of product.items) {
          ids.push(item.goodId);
        }
      } else {
        ids.push(product.goodId);
      }
    }

    return ids;
  }
}
