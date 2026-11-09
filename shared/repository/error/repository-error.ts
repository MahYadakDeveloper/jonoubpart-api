/**
 * Database-agnostic failure categories. Dialect adapters map their own codes
 * onto these.
 */
export type RepositoryErrorKind =
  | 'unique'
  | 'foreignKey'
  | 'check'
  | 'notNull'
  | 'invalidInput'
  | 'outOfRange'
  | 'exclusion'
  | 'serialization'
  | 'deadlock'
  | 'lockTimeout';

export interface RepositoryErrorInfo {
  kind?: RepositoryErrorKind | undefined;
  constraint?: string | undefined;
  table?: string | undefined;
  /** Column -> value parsed from the error detail. Best effort. */
  keys: Readonly<Record<string, string>>;
}

export type RepositoryErrorFactory = (info: RepositoryErrorInfo) => Error;

/** A factory, or an error class constructible without arguments. */
export type RepositoryErrorRule<I = RepositoryErrorInfo> =
  | ((info: I) => Error)
  | (new () => Error);

export interface RepositoryErrorRules {
  /** Matched first (most specific). */
  constraints?: Record<string, RepositoryErrorRule>;
  /** Fallback by error kind. */
  kinds?: Partial<Record<RepositoryErrorKind, RepositoryErrorRule>>;
}

// ---------------------------------------------------------------------------
// Port: implemented by the infrastructure layer
// ---------------------------------------------------------------------------

/**
 * Turns a raw driver error into a database-agnostic description. Returns `null`
 * when the error is not a database error. This is the only dialect-specific
 * piece (e.g. Postgres SQLSTATE codes).
 */
export type RepositoryErrorClassifier = (
  error: unknown,
) => RepositoryErrorInfo | null;

let classifier: RepositoryErrorClassifier | undefined;

/**
 * Called once by the infrastructure layer at bootstrap. One dialect per
 * process: a later call replaces the previous classifier.
 */
export function setRepositoryErrorClassifier(
  impl: RepositoryErrorClassifier,
): void {
  classifier = impl;
}

function classify(error: unknown): RepositoryErrorInfo | null {
  if (!classifier) {
    // Misconfiguration must be loud; the original error stays reachable.
    throw new Error(
      'No RepositoryErrorClassifier registered: call setRepositoryErrorClassifier() from the infrastructure layer.',
      { cause: error },
    );
  }
  return classifier(error);
}

// ---------------------------------------------------------------------------
// Dialect-agnostic mapping logic
// ---------------------------------------------------------------------------

/** Classes extend `Error`; arrow functions have no `prototype`. */
export function buildRepositoryError<I>(
  rule: RepositoryErrorRule<I>,
  info: I,
): Error {
  return rule.prototype instanceof Error
    ? new (rule as new () => Error)()
    : (rule as (info: I) => Error)(info);
}

/** Handled by retrying the whole transaction, never mapped to a domain error. */
const RETRYABLE: ReadonlySet<RepositoryErrorKind> = new Set([
  'serialization',
  'deadlock',
]);

export function isRetryableRepositoryError(error: unknown): boolean {
  const kind = classify(error)?.kind;
  return kind !== undefined && RETRYABLE.has(kind);
}

export function mapRepositoryError(
  error: unknown,
  rules: RepositoryErrorRules,
): unknown {
  const info = classify(error);
  if (!info || (info.kind && RETRYABLE.has(info.kind))) return error;

  const factory =
    (info.constraint && rules.constraints?.[info.constraint]) ||
    (info.kind && rules.kinds?.[info.kind]);
  if (!factory) return error;
  const mapped = buildRepositoryError(factory, info);
  mapped.cause ??= error;
  return mapped;
}
