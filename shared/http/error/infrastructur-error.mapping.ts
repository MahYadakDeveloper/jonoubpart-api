// infrastructure-error-mapping.ts
import { HttpStatus } from '@nestjs/common';
import { problemType, type ProblemDetails } from './problem-details';
import { InfrastructureError, InfrastructureErrorKind } from '@infra/errors';

const KIND_TO_HTTP: Record<
  InfrastructureErrorKind,
  { status: number; title: string }
> = {
  UNAVAILABLE: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    title: 'Service temporarily unavailable',
  },
  TIMEOUT: {
    status: HttpStatus.GATEWAY_TIMEOUT,
    title: 'Upstream request timed out',
  },
  UPSTREAM_FAILED: {
    status: HttpStatus.BAD_GATEWAY,
    title: 'Upstream service failed',
  },
  UPSTREAM_RATE_LIMITED: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    title: 'Service temporarily unavailable',
  },
};

export function infrastructureProblem(e: InfrastructureError): ProblemDetails {
  const { status, title } = KIND_TO_HTTP[e.kind];
  return {
    type: problemType(e.code),
    title,
    status,
    code: e.code,
    ...(e.retryAfterSeconds !== undefined && {
      retryAfter: e.retryAfterSeconds,
    }),
  };
}
