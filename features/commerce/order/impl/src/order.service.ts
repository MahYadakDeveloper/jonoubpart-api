import { Injectable } from '@nestjs/common';
import { OrderApi } from '@features/order/api';

@Injectable()
export class OrderService implements OrderApi {
  /**
   * This service is not dependent to delivery only to warehouse, payment
   */
  constructor() {}
  place(/* ... */) {
    // reserve products
    
    throw new Error('Method not implemented.');
  }

  async findById(orderId: string) {
    const order = await this.repository.findById(orderId);
    if (!order) throw new NotFoundException();

    return order;
  }

  async findManyByCustomerId(customerId: string) {
    const order = await this.repository.findByCustomerId(customerId);

    if (order.length === 0) throw new Error();

    return order;
  }

  async placeOrder({
    customerId,
    delivery,
    items,
  }: {
    customerId: string;
    delivery: { addressId: string; carrierKey?: string };
    items: { productId: string; quantity: number }[];
  }): Promise<{ id: string }> {
    if (items.length === 0)
      throw new BadRequestException('Order must contain at least one item');
    if (items.some((i) => !Number.isInteger(i.quantity) || i.quantity <= 0))
      throw new BadRequestException('Item quantity must be a positive integer');

    const customer = await this.customers.findById(customerId);

    const address = customer.addresses.find((a) => a.id === delivery.addressId);
    if (!address) throw new BadRequestException('Address not found');
    if (address.scope === 'inter_city' && !delivery.carrierKey)
      throw new BadRequestException(
        'Carrier is required for inter-city delivery',
      );

    const products = await this.catalog.findMany(items.map((i) => i.productId));

    // pricing
    const priceResult = await this.pricing.price(
      { customer: { id: customer.id, type: customer.type }, asOf: new Date() },
      items,
    );

    const { cancellationFee, expiry } = await this.settings.get(orderSettings);

    const merchandiseLines = this.buildMerchandiseLines(
      items,
      products,
      priceResult.items,
    );

    const { totals } = priceResult;

    return this.tx.run(() =>
      this.repository.withLock('order:place', customerId, async () => {
        // [NOTE] Only single order with pending payment state at a time
        if (await this.repository.hasPendingPaymentByCustomerId(customerId))
          throw new ConflictException(
            'Customer already has an order awaiting payment',
          );

        const { id } = await this.repository.create({
          customerId,
          merchandiseLines,
          cancellationFee,
          summary: {
            subtotal: totals.subtotal,
            discountTotal: totals.discount,
            taxTotal: 0,
            grandTotal: totals.net,
          },
          recipient: {
            customerContact: {
              fullName: customer.fullName,
              phone: customer.phone,
              type: customer.type,
            },
            ...address,
          },
          carrierKey: delivery.carrierKey,
        });

        const runAt = addDuration(new Date(), expiry);

        await this.payments.scheduleExpirePaymentJob(runAt, id);

        return { id };
      }),
    );
  }

  async cancelOrder({ orderId }: { orderId: string }) {
    const order = await this.repository.findById(orderId);

    if (!order) throw new Error();

    await this.tx.run(async () => {
      switch (order.status) {
        case 'process':
          await this.payment.refund({
            type: 'full',
            sessionId: order.payment.sessionId,
            customerId: order.customerId,
          });
          await this.fulfillment.cancel({ orderId });
          await this.delivery.cancelDelivery({ orderId });

          await this.repository.markAs(order.id, 'canceled_by_customer');
          break;
        case 'in_delivery':
          switch (order.delivery.status) {
            case 'courier_requested':
              const fee = order.cancellationTerms.fee;
              let refund = Money.zero();
              if (fee.type === 'fixed')
                refund = order.summary.grandTotal.subtract(
                  Money.create(fee.amount.value),
                );
              else {
                refund = order.summary.grandTotal.subtract(
                  order.summary.grandTotal.multiply(fee.rate),
                );
              }

              // [TODO] make payment refund segmented
              await this.payment.refund({
                type: 'partial',
                amount: refund,
                sessionId: order.payment.sessionId,
                customerId: order.customerId,
              });

              await this.delivery.cancelDelivery({ orderId });
              await this.repository.markAs(orderId, 'canceled_by_customer');
              break;
            default:
              throw new Error(
                'Cancel at this stage of delivery is not possible',
              );
          }
          break;
        default:
          throw new Error('Not cancelable at this stage');
      }
    });
  }

  async setSettings({ settings }: { settings: OrderSettings }) {
    await this.settings.set(orderSettings, settings);
  }

  private buildMerchandiseLines(
    items: { productId: string; quantity: number }[],
    products: Awaited<ReturnType<CatalogApi['findMany']>>,
    prices: Awaited<ReturnType<PricingApi['price']>>['items'],
  ): MerchandiseLine[] {
    const productsById = new Map(products.map((p) => [p.id, p]));
    const pricesById = new Map(prices.map((p) => [p.productId, p]));
    return items.map((i): MerchandiseLine => {
      const product = productsById.get(i.productId);
      const priced = pricesById.get(i.productId);
      if (!product || !priced || priced.productId !== i.productId)
        throw new Error(`Pricing result mismatch for product ${i.productId}`);

      const discount = priced.discount && {
        discountPerUnit: priced.discount.perUnit,
        discountedQuantity: priced.discount.quantity,
        totalDiscount: priced.discount.total,
      };

      const base = {
        productId: product.id,
        displayName: product.displayName,
        quantity: priced.quantity,
        unitPrice: priced.unitPrice,
        lineTotal: priced.net,
        ...(discount && { discount }),
      };

      if (product.kind === 'leaf') return { ...base, kind: 'leaf' };

      const componentsByProductId = new Map(
        (priced.components ?? []).map((c) => [c.productId, c]),
      );
      return {
        ...base,
        kind: 'bundle',
        items: product.items.map((component) => {
          const pricedComponent = componentsByProductId.get(component.id);
          if (!pricedComponent)
            throw new Error(`Missing priced component ${component.id}`);

          return {
            productId: component.id,
            displayName: component.displayName,
            quantity: pricedComponent.quantity,
            unitPrice: pricedComponent.unitPrice,
            lineTotal: pricedComponent.lineTotal,
          };
        }),
      };
    });
  }
}
