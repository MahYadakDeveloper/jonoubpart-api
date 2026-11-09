import { DomainError } from '@feature/shared/errors';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { catchError, Observable, throwError } from 'rxjs';
import {
  buildProblem,
  DomainErrorMapping,
  findMapping,
} from '../domain-error-mapping';
import { PROBLEM_MAPPINGS } from '../decorators';
import { CATEGORY_ERROR_MAPPINGS } from '../category-mappings';
import { ProblemException } from '../problem.exception';

@Injectable()
export class ProblemTranslationInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((err: unknown) => {
        if (!(err instanceof DomainError)) return throwError(() => err);

        const local =
          this.reflector.getAllAndMerge<DomainErrorMapping[]>(
            PROBLEM_MAPPINGS,
            [ctx.getHandler(), ctx.getClass()],
          ) ?? [];

        const mapping = findMapping(
          err.constructor,
          local,
          CATEGORY_ERROR_MAPPINGS,
        );

        return throwError(() =>
          mapping ? new ProblemException(buildProblem(err, mapping), err) : err,
        );
      }),
    );
  }
}
