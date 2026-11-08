import type { NewOutboxMessage } from '@nestjs/outbox';
import { z } from 'zod';

type Scheduling =
  | { availableAt?: NewOutboxMessage['availableAt']; delay?: never }
  | { delay?: NewOutboxMessage['delay']; availableAt?: never };

export type EventOptions = Omit<
  NewOutboxMessage,
  'topic' | 'payload' | 'availableAt' | 'delay'
> &
  Scheduling;

export function defineEvent<const T extends string, P extends z.ZodType>(
  topic: T,
  payload: P,
) {
  const schema = z.object({ topic: z.literal(topic), payload });

  type Message = NewOutboxMessage<z.output<P>> & { topic: T };

  return {
    topic,
    payload,
    schema,
    create: (data: z.input<P>, options?: EventOptions): Message => ({
      ...options,
      topic,
      payload: payload.parse(data),
    }),
    is: (message: { topic: string }): message is Message =>
      message.topic === topic,
  } as const;
}

export type EventOf<E extends { create: (...args: never[]) => unknown }> =
  ReturnType<E['create']>;

export type PayloadOf<E extends { payload: z.ZodType }> = z.output<
  E['payload']
>;
