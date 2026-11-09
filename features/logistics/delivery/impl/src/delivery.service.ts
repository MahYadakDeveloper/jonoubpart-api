import type { CourierApi } from '@feature/actors-api/courier';
import {
  assertFound,
  assertNever,
  assertSafeEqual,
} from '@feature/shared/utils/assertions';
import { DrizzleTransactionContext } from '@infra/db-drizzle';
import { SMS_QUEUE_NAME } from '@infra/messaging-queue/constants';
import { SmsJobs } from '@infra/messaging-queue/job-types';
import { DrizzleSettingsStore } from '@infra/settings-store';
import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { Outbox } from '@nestjs/outbox';
import { Queue } from 'bullmq';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { LocationsQuery } from '../locations/locations.query';
import { SmsDeliveryOutForDeliveryJobPayload } from '../sms/sms-opt.template';
import deliveryConfigs from './delivery.config';
import { DeliveryAttemptReportDto } from './delivery.dto';
import { deliveredEvent } from './delivery.events';
import { DeliveryRepository } from './delivery.repository';
import { DeliverySettingsToken } from './setting/token';

@Injectable()
export class DeliveryService {
  constructor(
    private readonly courier: CourierApi,
    private readonly settingsStore: DrizzleSettingsStore,
    private readonly location: LocationsQuery,
    private readonly repository: DeliveryRepository,
    @Inject(deliveryConfigs.KEY)
    private readonly configs: ConfigType<typeof deliveryConfigs>,
    private readonly tx: DrizzleTransactionContext,
    @InjectQueue(SMS_QUEUE_NAME) private readonly smsQueue: Queue,
    private readonly outbox: Outbox,
  ) {}

  async getAssignedCourierId(deliveryId: string) {
    const courierId = await this.repository.findAssignedCourierId(deliveryId);
    if (!courierId)
      throw new UnprocessableEntityException('Courier not assigned');

    return courierId;
  }

  async findById(deliveryId: string) {
    const delivery = await this.repository.findById(deliveryId);
    if (!delivery)
      throw new NotFoundException(`Delivery not found: ${deliveryId}`);

    return delivery;
  }

  async findAll() {
    return this.repository.findAll();
  }

  async deliver(deliveryId: string): Promise<void> {
    const delivery = await this.repository.findById(deliveryId);

    assertDeliveryFound(delivery);

    await this.courier.notifyPickup(delivery.id);

    await this.repository.update(delivery.id, {
      requestedAt: new Date(),
    });
  }

  async confirmPickup(deliveryId: string, courierId: string) {
    await this.tx.run(async () =>
      this.repository.withForUpdate(async () => {
        const delivery = await this.repository.findById(deliveryId);

        assertDeliveryFound(delivery);

        if (delivery.status !== 'courier_requested') {
          throw new ConflictException('Delivery is already picked up');
        }

        const confirmationCode = this.generateCode(6);

        await this.smsQueue.add(SmsJobs.Send, {
          to: delivery.recipient.customerContact.phone,
          template: 'delivery.out-for-delivery',
          data: {
            confirmationCode,
          },
        } satisfies SmsDeliveryOutForDeliveryJobPayload);

        await this.repository.update(deliveryId, {
          courierId,
          handedOverAt: new Date(),
          confirmationCode,
        });
      }),
    );
  }

  async reportDeliveryAttempt(
    deliveryId: string,
    attempt: DeliveryAttemptReportDto,
  ) {
    return this.tx.run(async () =>
      this.repository.withForUpdate(async () => {
        const delivery = await this.repository.findById(deliveryId);

        assertDeliveryFound(delivery);

        if (attempt.report.outcome === 'failed') {
          await this.repository.recordDeliveryAttemptFailure({
            deliveryId,
            ...attempt.report,
          });

          return;
        }

        if (delivery.scope !== attempt.scope) {
          throw new Error();
        }

        if (attempt.scope === 'intra_city')
          assertSafeEqual(
            delivery.confirmationCode!,
            attempt.report.confirmationCode,
            () => new ForbiddenException('Invalid confirmation code'),
          );

        const { outcome: _, ...data } = attempt.report;

        await this.repository.update(delivery.id, {
          status: 'delivered',
          deliveredAt: new Date(),
          ...data,
        });

        await this.outbox.add(
          this.tx.current,
          deliveredEvent.create({ orderId: delivery.orderId }),
        );
      }),
    );
  }

  async receiveReturnedDelivery(deliveryId: string) {
    await this.tx.run(async () =>
      this.repository.withForUpdate(async () => {
        const delivery = await this.repository.findById(deliveryId);

        assertDeliveryFound(delivery);

        await this.repository.update(delivery.id, {
          status: 'returned_to_warehouse',
          returnedAt: new Date(),
        });

        await this.outbox.add(this.tx.current, {
          topic: 'delivery.returned_to_warehouse',
          payload: { orderId: delivery.orderId },
        });
      }),
    );
  }

  async cancelDelivery(deliveryId: string): Promise<void> {
    const delivery = await this.repository.findById(deliveryId);

    assertDeliveryFound(delivery);

    switch (delivery.status) {
      case 'canceled':
        return;
      case 'pending':
      case 'courier_requested': {
        await this.repository.update(delivery.id, {
          status: 'canceled',
          canceledAt: new Date(),
        });
        return;
      }
      case 'handed_over_to_courier':
      case 'delivered':
      case 'returned_to_warehouse':
        throw new ConflictException(
          `Delivery cannot be canceled in status "${delivery.status}"`,
        );
      default:
        assertNever(delivery.status);
    }
  }

  async setSettings(settings: z.infer<typeof DeliverySettingsToken.schema>) {
    await this.settingsStore.set(DeliverySettingsToken, settings);
  }

  async getSettings() {
    await this.settingsStore.get(DeliverySettingsToken);
  }

  listProvinces() {
    return this.location.listProvinces();
  }

  listCitiesByProvinceId(provinceId: number) {
    return this.location.listCitiesByProvinceId(provinceId);
  }

  private generateCode(length = 4): string {
    if (length < 4 || length > 9) {
      throw new Error('OTP length must be between 4 and 9');
    }

    const max = 10 ** length;

    return randomInt(0, max).toString().padStart(length, '0');
  }
}

function assertDeliveryFound(
  delivery: Awaited<ReturnType<DeliveryRepository['findById']>>,
): asserts delivery is NonNullable<
  Awaited<ReturnType<DeliveryRepository['findById']>>
> {
  assertFound(delivery, () => new NotFoundException('Delivery not found'));
}
