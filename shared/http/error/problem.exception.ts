import { HttpException } from '@nestjs/common';
import type { ProblemDetails } from './problem-details';

export class ProblemException extends HttpException {
  constructor(
    readonly problem: ProblemDetails,
    cause?: unknown,
  ) {
    super(problem, problem.status, { cause });
  }
}
