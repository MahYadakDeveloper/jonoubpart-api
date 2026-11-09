import { DomainError } from '@feature/shared/errors';
import { HttpStatus } from '@nestjs/common';
import { ProblemDetails, problemType } from './problem-details';

export const errorsWithKeys = <T extends Record<string, unknown>>(map: T) =>
  Object.assign(Object.values(map) as T[keyof T][], map);

export type DomainErrorClass<T extends DomainError = DomainError> =
  (abstract new (...args: any[]) => T) & { readonly code: string };

export interface DomainErrorMapping<T extends DomainError = DomainError> {
  readonly errorClass: DomainErrorClass<T>;
  readonly status: HttpStatus;
  readonly title: string;
  extensions?(error: T): Record<string, unknown>; // method syntax => bivariant
}

export const mapDomainError = <T extends DomainError>(
  errorClass: DomainErrorClass<T>,
  status: HttpStatus,
  title: string,
  extensions?: (error: T) => Record<string, unknown>,
): DomainErrorMapping<T> => ({ errorClass, status, title, extensions });

export function findMapping(
  errorClass: Function,
  ...sources: (readonly DomainErrorMapping[])[]
): DomainErrorMapping | undefined {
  let ctor: Function | null = errorClass;
  while (ctor && ctor !== Function.prototype) {
    for (const list of sources) {
      const mapping = list.find((m) => m.errorClass === ctor);
      if (mapping) return mapping;
    }
    ctor = Object.getPrototypeOf(ctor);
  }
  return undefined;
}

export function buildProblem(
  error: DomainError,
  mapping: DomainErrorMapping,
): ProblemDetails {
  return {
    ...mapping.extensions?.(error),
    type: problemType(error.code),
    title: mapping.title,
    status: mapping.status,
    code: error.code,
    ...(mapping.status < 500 && { detail: error.message }),
  };
}
