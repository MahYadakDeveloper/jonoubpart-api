import { DomainError } from '@feature/shared/errors';
import { InfrastructureError } from '@infra/errors';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { STATUS_CODES } from 'node:http';
import { infrastructureProblem } from '../infrastructur-error.mapping';
import { PROBLEM_JSON, ProblemDetails, problemType } from '../problem-details';
import { ProblemException } from '../problem.exception';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    const problem: ProblemDetails = {
      ...this.toProblem(exception),
      instance: `urn:request:${req.id}`,
    };

    if (problem.status >= 500) {
      const original =
        exception instanceof ProblemException ? exception.cause : exception;
      this.logger.error(
        `${req.method} ${req.url} -> ${problem.status}`,
        original instanceof Error ? original.stack : String(original),
      );
    }

    const retryAfter =
      exception instanceof InfrastructureError
        ? exception.retryAfterSeconds
        : undefined;

    void reply
      .status(problem.status)
      .type(PROBLEM_JSON)
      .headers(
        retryAfter !== undefined ? { 'retry-after': String(retryAfter) } : {},
      )
      .send(problem);
  }

  private toProblem(e: unknown): ProblemDetails {
    if (e instanceof ProblemException) return e.problem;
    if (e instanceof HttpException) return this.fromHttpException(e);
    if (e instanceof InfrastructureError) return infrastructureProblem(e);
    if (e instanceof ThrottlerException) {
      return {
        type: problemType('RATE_LIMITED'),
        title: 'Too many requests',
        status: HttpStatus.TOO_MANY_REQUESTS,
        code: 'RATE_LIMITED',
      };
    }
    if (e instanceof DomainError) {
      this.logger.error(`Unmapped domain error: ${e.code}`);
    }
    return this.internal();
  }

  private fromHttpException(e: HttpException): ProblemDetails {
    const status = e.getStatus();
    const body = e.getResponse();
    const messages =
      typeof body === 'object' &&
      'message' in body &&
      Array.isArray(body.message)
        ? (body.message as string[])
        : undefined;

    if (status === HttpStatus.BAD_REQUEST && messages) {
      return {
        type: problemType('VALIDATION_FAILED'),
        title: 'Request validation failed',
        status,
        code: 'VALIDATION_FAILED',
        errors: messages.map((detail) => ({ detail })),
      };
    }
    return {
      type: 'about:blank',
      title: STATUS_CODES[status] ?? 'Error',
      status,
      ...(status < 500 && { detail: e.message }),
    };
  }

  private internal(): ProblemDetails {
    return {
      type: 'about:blank',
      title: STATUS_CODES[500]!,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    };
  }
}
