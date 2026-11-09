import type { CatalogApi } from '@feature/catalog-api';
import {
  assertFirst,
  assertFound,
  assertNever,
  ensureFound,
} from '@feature/shared/utils/assertions';
import {
  type StockMovementApi,
  type StockReservationApi,
  STOCK_MOVEMENT_API,
  STOCK_RESERVATION_API,
} from '@feature/warehouse-api';
import { DrizzleTransactionContext } from '@infra/db-drizzle';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Outbox } from '@nestjs/outbox';
import { canceledByManagerEvent, fulfilledEvent } from './fulfillment.events';
import type { FulfillmentRepository } from './fulfillment.repository';

@Injectable()
export class FulfillmentService {
  constructor(
    private readonly repository: FulfillmentRepository,
    private readonly catalog: CatalogApi,
    @Inject(STOCK_RESERVATION_API)
    private readonly reservation: StockReservationApi,
    @Inject(STOCK_MOVEMENT_API)
    private readonly movement: StockMovementApi,
    private readonly tx: DrizzleTransactionContext,
    private readonly outbox: Outbox,
  ) {}

  getById(id: string) {
    return this.repository
      .findById(id)
      .then((f) =>
        ensureFound(f, () => new NotFoundException(`Fulfillment not found.`)),
      );
  }

  list() {
    return this.repository.list();
  }

  async fulfill(fulfillmentId: string) {
    await this.tx.run(async () =>
      this.repository.withForUpdate(async () => {
        const fulfillment = await this.repository.findById(fulfillmentId);

        assertFulfillmentFound(fulfillment);

        if (fulfillment.status !== 'pending')
          throw new ConflictException(
            `Fulfillment ${fulfillmentId} is "${fulfillment.status}", cannot move to processing`,
          );

        assertFirst(
          await this.repository.update(fulfillmentId, {
            status: 'processing',
          }),
          () =>
            new ConflictException(
              `Fulfillment ${fulfillmentId} cannot move to processing`,
            ),
        );

        // TODO add notification, notify managers
      }),
    );
  }

  async complete(
    fulfillmentId: string,
    picked: { stockId: string; quantity: number }[],
  ) {
    await this.tx.run(async () =>
      this.repository.withForUpdate(async () => {
        const fulfillment = await this.repository.findById(fulfillmentId);

        assertFulfillmentFound(fulfillment);

        const required = this.sumByStock(
          fulfillment.merchandiseLines.flatMap((line) =>
            line.kind === 'bundle'
              ? line.items.map((item) => ({
                  stockId: item.stockId,
                  quantity: item.quantity * line.quantity,
                }))
              : [{ stockId: line.stockId, quantity: line.quantity }],
          ),
        );

        const actual = this.sumByStock(picked);

        const mismatches = this.diffStocks(required, actual);
        if (mismatches.length > 0) {
          throw new BadRequestException({
            message: 'Picked stocks do not match required stocks',
            mismatches,
          });
        }

        await this.tx.run(async () => {
          await this.reservation.release(fulfillment.reservationId);

          await this.movement.issue({
            idempotencyKey: `fulfillment:issue:${fulfillment.id}`,
            items: [...required].map(([stockId, quantity]) => ({
              stockId,
              quantity,
            })),
            source: {
              boundary: 'order',
              referenceId: fulfillment.orderId,
              type: 'sales',
            },
          });

          await this.repository.update(fulfillment.id, {
            status: 'fulfilled',
          });

          await this.outbox.add(
            this.tx.current,
            fulfilledEvent.create({ orderId: fulfillment.orderId }),
          );
        });
      }),
    );
  }

  async cancelByManager(fulfillmentId: string, reason: string) {
    await this.tx.run(async () =>
      this.repository.withForUpdate(async () => {
        const fulfillment = await this.repository.findById(fulfillmentId);

        assertFulfillmentFound(fulfillment);

        await this.repository.update(fulfillmentId, {
          status: 'canceled_by_merchant',
          reason,
        });

        await this.reservation.release(fulfillment.reservationId);

        await this.outbox.add(
          this.tx.current,
          canceledByManagerEvent.create({ orderId: fulfillment.orderId }),
        );
      }),
    );
  }

  async cancel(fulfillmentId: string) {
    await this.tx.run(async () =>
      this.repository.withForUpdate(async () => {
        const fulfillment = await this.repository.findById(fulfillmentId);

        assertFulfillmentFound(fulfillment);

        switch (fulfillment.status) {
          case 'canceled_by_customer':
            return;
          case 'pending':
          case 'processing':
            break;
          case 'fulfilled':
          case 'canceled_by_manager':
            throw new ConflictException(
              `Fulfillment ${fulfillmentId} cannot be canceled in status "${fulfillment.status}"`,
            );
          default:
            assertNever(fulfillment.status);
        }
      }),
    );
  }

  private sumByStock(
    lines: { stockId: string | null; quantity: number }[],
  ): Map<string, number> {
    const result = new Map<string, number>();
    for (const { stockId, quantity } of lines) {
      if (stockId === null) {
        throw new Error('Merchandise line has no stock assigned');
      }
      result.set(stockId, (result.get(stockId) ?? 0) + quantity);
    }
    return result;
  }

  private diffStocks(
    required: Map<string, number>,
    actual: Map<string, number>,
  ) {
    const ids = new Set([...required.keys(), ...actual.keys()]);
    return [...ids]
      .map((stockId) => ({
        stockId,
        required: required.get(stockId) ?? 0,
        picked: actual.get(stockId) ?? 0,
      }))
      .filter((d) => d.required !== d.picked);
  }
}

function assertFulfillmentFound(
  fulfillment: Awaited<ReturnType<FulfillmentRepository['findById']>>,
): asserts fulfillment is NonNullable<
  Awaited<ReturnType<FulfillmentRepository['findById']>>
> {
  assertFound(
    fulfillment,
    () => new NotFoundException('Fulfillment not found'),
  );
}
