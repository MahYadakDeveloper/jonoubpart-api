import type { WalletApi } from '@feature/actors-api/customer/wallet';
import { DrizzleTransactionContext } from '@infra/db-drizzle';
import { BullmqJobScheduler } from '@infra/messaging-job-scheduler';
import { PaymentGatewayResolver, PaymentStatus } from '@infra/payment-gateway';
import { RedlockSynchronizer } from '@infra/synchronizer';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DeliveryService } from '../delivery/delivery.service';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
import { ExpirePaymentJob } from './expire-payment.job';
import { PaymentRepository, PaymentRow } from './payment.repository';
import { PaymentMethodSelection } from './payment.schema';
import { RefundRequest, SettlementResult } from './payment.types';

/**
 * [NOTE] If the customer cancels the payment on the IPG, the payment
 * session is not canceled. The customer is still redirected to the
 * payment session, where they can choose another payment method if
 * available. They may also cancel the payment manually or leave the
 * session to expire.
 *
 * If the session expires without a successful payment, the order is
 * marked as expired due to non-payment or customer cancellation.
 * The customer can then place the order again if desired.
 */

type Allocation =
  | { method: 'wallet'; amount: number }
  | { method: 'gateway'; amount: number }
  | { method: 'partial'; walletAmount: number; gatewayAmount: number };

@Injectable()
export class PaymentService {
  constructor(
    private readonly wallet: WalletApi,
    private readonly repository: PaymentRepository,
    private readonly gateways: PaymentGatewayResolver,
    private readonly tx: DrizzleTransactionContext,
    private readonly synchronizer: RedlockSynchronizer,
    private readonly fulfillment: FulfillmentService,
    private readonly delivery: DeliveryService,
    private readonly job: BullmqJobScheduler,
  ) {}

  findById(paymentId: number) {
    return this.repository.findById(paymentId);
  }

  findOwnerId(paymentId: number) {
    return this.repository.findOwnerId(paymentId);
  }

  findByOrderId(orderId: string) {
    return this.repository.findByOrderId(orderId);
  }

  async scheduleExpirePaymentJob(runAt: Date, orderId: string) {
    const payment = await this.repository.findByOrderId(orderId);
    if (!payment)
      throw new NotFoundException(`Payment for order ${orderId} not found`);

    const { jobId } = await this.job.schedule(ExpirePaymentJob, runAt, {
      paymentId: payment.id,
    });

    try {
      const updated = await this.repository.update(payment.id, {
        expiryJobId: jobId,
      });
      if (updated.length === 0)
        throw new InternalServerErrorException(
          `Expire job ${jobId} could not be linked to payment ${payment.id}`,
        );
    } catch (error) {
      // Don't leave an orphaned job that would expire a payment we can't track
      await this.job.cancel(jobId).catch(() => undefined);
      throw error;
    }
  }

  async cancelExpirePaymentJob(jobId: string) {
    await this.job.cancel(jobId);
  }

  async expire(paymentId: number) {
    return this.exclusive(paymentId, async () => {
      const payment = await this.requirePayment(paymentId);
      this.assertStatus(payment, 'pending');

      await this.onFailed(payment, 'expired');
    });
  }

  async verify(paymentId: number): Promise<PaymentStatus> {
    return this.exclusive(paymentId, async () => {
      const payment = await this.requirePayment(paymentId);
      this.assertStatus(payment, 'processing');
      if (payment.method === 'wallet')
        throw new InternalServerErrorException(
          `Wallet payment ${paymentId} cannot be verified`,
        );

      const gateway = this.gateways.resolve(payment.gatewayKey!);
      const status = await gateway.verifyPayment(
        payment.id,
        payment.trackingCode!,
      );

      switch (status) {
        case 'verified':
        case 'verified-before':
          await this.onPaid(payment.id, payment.orderId);
          break;
        case 'pending':
          break;
        case 'expired':
          await this.onFailed(payment, 'expired');
          break;
        default:
          await this.onFailed(payment, 'failure');
      }

      return status;
    });
  }

  async cancel(paymentId: number) {
    return this.exclusive(paymentId, async () => {
      const payment = await this.requirePayment(paymentId);
      this.assertStatus(payment, 'processing');
      if (payment.method === 'wallet')
        throw new InternalServerErrorException(
          `Wallet payment ${paymentId} cannot be canceled`,
        );

      const gateway = this.gateways.resolve(payment.gatewayKey!);
      await gateway.cancelPayment(payment.id, payment.trackingCode!);

      await this.tx.run(async () => {
        if (payment.method === 'partial')
          await this.refundToWallet(payment, payment.walletAmount!);

        await this.repository.updateStatus(payment.id, { status: 'pending' });
        await this.delivery.cancelDelivery(payment.orderId);
      });
    });
  }

  async settle(
    paymentId: number,
    selection: PaymentMethodSelection,
  ): Promise<SettlementResult> {
    return this.exclusive(paymentId, async () => {
      const context = await this.repository.findSettleContext(paymentId);
      if (!context)
        throw new NotFoundException(`Payment ${paymentId} not found`);

      const { payment, amount } = context;

      this.assertStatus(payment, 'pending');

      const allocation = await this.allocate(
        payment.customerId!,
        amount,
        selection,
      );

      if (allocation.method === 'wallet') {
        await this.settleWithWallet(payment, payment.customerId!, allocation);
        return { status: 'paid' };
      }

      const paymentUrl = await this.settleWithGateway(
        context,
        payment.customerId!,
        (selection as Extract<PaymentMethodSelection, { gatewayKey: string }>)
          .gatewayKey,
        allocation,
      );
      return { status: 'processing', paymentUrl };
    });
  }

  async refund(req: RefundRequest): Promise<void> {
    return this.exclusive(req.paymentId, async () => {
      const payment = await this.requirePayment(req.paymentId);
      this.assertStatus(payment, 'paid');

      if (req.type === 'partial') {
        const paidTotal =
          payment.amount ?? payment.walletAmount! + payment.gatewayAmount!;
        if (!Number.isSafeInteger(req.amount) || req.amount <= 0)
          throw new BadRequestException(
            'Refund amount must be a positive integer',
          );
        if (req.amount > paidTotal)
          throw new BadRequestException(
            `Refund amount ${req.amount} exceeds the paid amount ${paidTotal}`,
          );

        await this.tx.run(async () => {
          await this.refundToWallet(payment, req.amount);
          await this.repository.updateStatus(payment.id, {
            status: 'refunded',
            refundType: 'partial',
            refundDestination: 'wallet',
            refundedAmount: req.amount,
          });
        });
        return;
      }

      // A failed gateway refund throws, so nothing is credited twice on retry.
      if (payment.method !== 'wallet') {
        const gateway = this.gateways.resolve(payment.gatewayKey!);
        await gateway.refundPayment(payment.id, payment.trackingCode!);
      }

      await this.tx.run(async () => {
        if (payment.method === 'wallet')
          await this.refundToWallet(payment, payment.amount!);
        if (payment.method === 'partial')
          await this.refundToWallet(payment, payment.walletAmount!);

        await this.repository.updateStatus(payment.id, {
          status: 'refunded',
          refundType: 'full',
          refundDestination: payment.method!,
        });
      });
    });
  }

  private async settleWithWallet(
    payment: PaymentRow,
    customerId: string,
    { amount }: Extract<Allocation, { method: 'wallet' }>,
  ) {
    const settledAt = new Date();

    await this.tx.run(async () => {
      await this.wallet.withdraw({
        amount,
        customerId,
        reason: 'payment',
        idempotencyKey: this.walletKey(payment.id, settledAt, 'withdraw'),
      });

      const settled = await this.repository.settle(payment.id, {
        status: 'paid',
        method: 'wallet',
        amount,
        customerId,
        settledAt,
      });
      if (!settled)
        throw new ConflictException(
          `Payment ${payment.id} is no longer pending`,
        );

      await this.fulfillment.fulfill({ orderId: payment.orderId });
    });

    if (payment.expiryJobId)
      await this.cancelExpirePaymentJob(payment.expiryJobId);
  }

  /** Creates the gateway ticket first, so a gateway failure never costs the wallet. */
  private async settleWithGateway(
    context: NonNullable<
      Awaited<ReturnType<PaymentRepository['findSettleContext']>>
    >,
    customerId: string,
    gatewayKey: string,
    allocation: Exclude<Allocation, { method: 'wallet' }>,
  ): Promise<string> {
    const { payment } = context;
    const gateway = this.gateways.resolve(gatewayKey);
    if (allocation.method === 'partial' && !gateway.supportsPartialPayment)
      throw new BadRequestException(
        `Gateway ${gatewayKey} does not support partial payment`,
      );

    if (payment.expiryJobId) {
      const minutes =
        gateway.expiryInMinutes + gateway.verificationDeadlineInMinutes;
      await this.job.update(
        payment.expiryJobId,
        new Date(Date.now() + minutes * 60_000),
      );
    }

    const { paymentUrl, trackingCode } = await gateway.createPayment({
      providerId: payment.id,
      customer: { phone: context.customerPhone },
      merchandise: context.merchandise,
      amount:
        allocation.method === 'partial'
          ? allocation.gatewayAmount
          : allocation.amount,
    });

    const settledAt = new Date();
    await this.tx.run(async () => {
      if (allocation.method === 'partial')
        await this.wallet.withdraw({
          amount: allocation.walletAmount,
          customerId,
          reason: 'payment',
          idempotencyKey: this.walletKey(payment.id, settledAt, 'withdraw'),
        });

      const settled = await this.repository.settle(payment.id, {
        status: 'processing',
        customerId,
        settledAt,
        gatewayKey,
        trackingCode,
        ...allocation,
      });
      if (!settled)
        throw new ConflictException(
          `Payment ${payment.id} is no longer pending`,
        );
    });

    return paymentUrl;
  }

  private async allocate(
    customerId: string,
    amount: number,
    selection: PaymentMethodSelection,
  ): Promise<Allocation> {
    if (selection.method === 'gateway') return { method: 'gateway', amount };

    const { available } = await this.wallet.getBalance({
      customerId: customerId,
    });

    if (selection.method === 'wallet') {
      if (available < amount)
        throw new UnprocessableEntityException(
          `Insufficient wallet balance: requested ${amount}, available ${available}`,
        );

      return { method: 'wallet', amount };
    }

    const walletAmount =
      selection.walletUsage.mode === 'full'
        ? Math.min(available, amount)
        : selection.walletUsage.amount;

    if (!Number.isSafeInteger(walletAmount) || walletAmount <= 0)
      throw new BadRequestException(
        'Wallet payment amount must be a positive integer',
      );
    if (walletAmount >= amount)
      throw new BadRequestException(
        'Wallet covers the whole amount, use the wallet method instead',
      );
    if (walletAmount > available)
      throw new UnprocessableEntityException(
        `Insufficient wallet balance: requested ${walletAmount}, available ${available}`,
      );

    return {
      method: 'partial',
      walletAmount,
      gatewayAmount: amount - walletAmount,
    };
  }

  /** Payment and its order side effects commit or roll back together. */
  private async onPaid(paymentId: number, orderId: string) {
    await this.tx.run(async () => {
      await this.repository.updateStatus(paymentId, { status: 'paid' });
      await this.fulfillment.fulfill({ orderId });
    });
  }

  private async onFailed(payment: PaymentRow, status: 'expired' | 'failure') {
    await this.tx.run(async () => {
      await this.repository.updateStatus(payment.id, { status });

      if (payment.method === 'partial')
        await this.refundToWallet(payment, payment.walletAmount!);

      await this.delivery.cancelDelivery(payment.orderId);
    });
  }

  /**
   * Cancel, failure and refund are mutually exclusive for one settle attempt,
   * so they share a key; a new attempt gets a new key.
   */
  private refundToWallet(payment: PaymentRow, amount: number) {
    if (!payment.customerId || !payment.settleRequestedAt)
      throw new InternalServerErrorException(
        `Payment ${payment.id} has no settled customer to refund`,
      );

    return this.wallet.deposit({
      amount,
      customerId: payment.customerId,
      reason: 'refund',
      idempotencyKey: this.walletKey(
        payment.id,
        payment.settleRequestedAt,
        'refund',
      ),
    });
  }

  private walletKey(
    paymentId: number,
    settledAt: Date,
    operation: 'withdraw' | 'refund',
  ) {
    return `payment:${paymentId}:${settledAt.getTime()}:${operation}`;
  }

  private exclusive<T>(paymentId: number, work: () => Promise<T>): Promise<T> {
    return this.synchronizer.executeExclusive(`payment:${paymentId}`, work);
  }

  private async requirePayment(paymentId: number): Promise<PaymentRow> {
    const payment = await this.repository.findById(paymentId);
    if (!payment) throw new NotFoundException(`Payment ${paymentId} not found`);
    return payment;
  }

  private assertStatus(payment: PaymentRow, expected: PaymentRow['status']) {
    if (payment.status !== expected)
      throw new ConflictException(
        `Payment ${payment.id} is ${payment.status}, expected ${expected}`,
      );
  }
}
