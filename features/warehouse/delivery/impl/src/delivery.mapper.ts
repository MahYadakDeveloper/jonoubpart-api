import { deliveries } from '@infra/db-drizzle/schema';
import type { Recipient, RecipientOf } from './delivery';

export function toDeliveryInsert(
  orderId: string,
  recipient: Recipient,
): typeof deliveries.$inferInsert {
  return {
    orderId,
    status: 'pending',
    recipient,
  };
}

function required<T>(
  value: T | null,
  field: string,
  row: typeof deliveries.$inferSelect,
): T {
  if (value === null) {
    throw new Error(
      `Delivery ${row.id} in status "${row.status}" is missing "${field}"`,
    );
  }
  return value;
}

// Recipient is stored as unvalidated jsonb, so its per-status shape is trusted here.
export function toDelivery(row: typeof deliveries.$inferSelect) {
  const { id } = row;

  switch (row.status) {
    case 'pending':
      return {
        id,
        status: 'initial',
        recipient: row.recipient as RecipientOf<'initial'>,
      };
    case 'courier_requested':
      return {
        id,
        status: 'courier_requested',
        requestedAt: required(row.requestedAt, 'requestedAt', row),
        recipient: row.recipient as RecipientOf<'courier_requested'>,
      };
    case 'canceled':
      return {
        id,
        status: 'canceled',
        canceledAt: required(row.canceledAt, 'canceledAt', row),
        recipient: row.recipient as RecipientOf<'canceled'>,
      };
    case 'handed_over_to_courier':
      return {
        id,
        status: 'handed_over_to_courier',
        courierId: required(row.courierId, 'courierId', row),
        handedOverAt: required(row.handedOverAt, 'handedOverAt', row),
        recipient: row.recipient as RecipientOf<'handed_over_to_courier'>,
      };
    case 'delivered':
      return {
        id,
        status: 'delivered',
        courierId: required(row.courierId, 'courierId', row),
        deliveredAt: required(row.deliveredAt, 'deliveredAt', row),
        recipient: row.recipient as RecipientOf<'delivered'>,
      };
    case 'returned_to_warehouse':
      return {
        id,
        status: 'returned_to_warehouse',
        courierId: required(row.courierId, 'courierId', row),
        returnedAt: required(row.returnedAt, 'returnedAt', row),
        recipient: row.recipient as RecipientOf<'returned_to_warehouse'>,
      };
  }
}
