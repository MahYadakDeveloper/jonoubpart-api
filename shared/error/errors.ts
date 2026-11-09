/**
 * Naming domain errors:
 *
 * - Name the business condition, not the technical cause or HTTP status (InsufficientBalanceError, not BadRequestError or
 *   PgCheckViolationError).
 * - Format: <Subject><Condition>Error, e.g. MovementNotFoundError, WalletInsufficientBalanceError. Use "Failure" only for
 *   a generic operation failure with a `reason` param (MovementFailure).
 * - Past-tense or state words read best: NotFound, AlreadyExists, Expired, Insufficient, Invalid, Forbidden.
 * - The code mirrors the name: MovementNotFoundError -> MOVEMENT_NOT_FOUND.
 * - One class per distinct client behavior; reasons that only differ in detail go into `params`, not into new classes.
 */
const CODE_CACHE = new WeakMap<object, string>();
const ENTITY_CACHE = new WeakMap<object, string>();

export abstract class DomainError extends Error {
  static codeOf(cls: { name: string }): string {
    return cls.name
      .replace(/(Error|Exception)$/, '')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toUpperCase();
  }

  static get code(): string {
    let code = CODE_CACHE.get(this);
    if (!code) {
      code = DomainError.codeOf(this);
      CODE_CACHE.set(this, code);
    }
    return code;
  }

  get code(): string {
    return (this.constructor as typeof DomainError).code;
  }

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/**
 * Base categories for domain errors. Each category maps to one kind of client behavior, so the transport layer (HTTP,
 * RPC, queue consumer) can translate errors by category without knowing individual error classes.
 */

/**
 * The requested resource does not exist, or is not visible to the caller.
 *
 * Use when a lookup by id/key/unique field finds nothing (MovementNotFoundError, WalletNotFoundError). Prefer extending
 * EntityNotFoundError for plain "entity with id X" cases.
 *
 * Client behavior: stop retrying with the same identifier; fix the input. HTTP: 404.
 */
export abstract class NotFoundError extends DomainError {}

/**
 * The request is valid on its own, but conflicts with the current state of an existing resource.
 *
 * Use for uniqueness violations (WalletAlreadyExistsError), stale or concurrent updates (optimistic-lock mismatch), and
 * operations that are impossible in the resource's current state (MovementAlreadyCancelledError).
 *
 * Client behavior: re-fetch the current state, then retry or give up. HTTP: 409.
 */
export abstract class ConflictError extends DomainError {}

/**
 * The request is syntactically or structurally invalid: unparsable payload, wrong format, missing or ill-typed fields,
 * values that can never be valid regardless of system state (MalformedPhoneError, InvalidCursorError).
 *
 * Distinct from BusinessRuleViolationError: a bad request is wrong on its own, a business rule violation is well-formed
 * but rejected given domain rules. Distinct from ConflictError: no dependency on current state.
 *
 * Client behavior: do not retry as-is; fix the payload. HTTP: 400.
 */
export abstract class BadRequestError extends DomainError {}

/**
 * The caller is identified, but is not allowed to perform this action on this resource.
 *
 * Use for ownership, role, or policy checks that fail inside the domain (ManagerNotAllowedToAdjustError). Do not use
 * for missing or invalid credentials; that is an authentication concern handled outside the domain.
 *
 * Client behavior: do not retry; request access or switch account. HTTP: 403.
 */
export abstract class ForbiddenError extends DomainError {}

/**
 * The input is well-formed and the caller is allowed, but the operation would break a business invariant.
 *
 * Use for rules that depend on domain state or semantics, not on input shape (WalletInsufficientBalanceError,
 * AdjustmentWindowExpiredError). Shape and type problems belong to schema validation (zod), not here.
 *
 * Client behavior: show the reason to the user; retrying unchanged will fail. HTTP: 422 (or 400, per project
 * convention).
 */
export abstract class BusinessRuleViolationError extends DomainError {}

export abstract class EntityNotFoundError extends NotFoundError {
  /** Override only when the auto-derived name is not what you want. */
  static readonly entity?: string;

  static entityOf(cls: { name: string }): string {
    return cls.name.replace(/(NotFound)?(Error|Exception)?$/, '');
  }

  static get resolvedEntity(): string {
    // an explicit static `entity` on the subclass wins
    if (Object.prototype.hasOwnProperty.call(this, 'entity') && this.entity) {
      return this.entity;
    }
    let entity = ENTITY_CACHE.get(this);
    if (!entity) {
      entity = EntityNotFoundError.entityOf(this);
      ENTITY_CACHE.set(this, entity);
    }
    return entity;
  }

  get entity(): string {
    return (this.constructor as typeof EntityNotFoundError).resolvedEntity;
  }

  readonly id?: string | number;
  readonly params: Readonly<Record<string, unknown>>;

  constructor(
    id?: string | number,
    options?: { cause?: unknown; params?: Record<string, unknown> },
  ) {
    const entity = (new.target as typeof EntityNotFoundError).resolvedEntity;
    super(
      id === undefined ? `${entity} not found` : `${entity} not found: ${id}`,
      { cause: options?.cause },
    );
    this.id = id;
    this.params = { ...(id !== undefined && { id }), ...options?.params };
  }
}
