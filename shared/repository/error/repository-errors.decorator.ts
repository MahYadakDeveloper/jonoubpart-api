import { type RepositoryErrorRules, mapRepositoryError } from './repository-error';

/**
 * Class decorator for repository IMPLEMENTATIONS (classes that implement a
 * repository interface). Translates persistence errors into domain errors
 * according to `rules`.
 *
 * Wraps every OWN method that returns a native Promise (i.e. `async` methods).
 * Sync methods and methods returning a Drizzle query builder are left untouched.
 * Inherited methods are not wrapped (e.g. the protected helpers of
 * DrizzleBaseRepository), so decorate the concrete class, not its base.
 *
 * @example
 * @RepositoryErrors({
 *   constraints: { movements_reference_unique: DuplicateMovementError },
 *   kinds: { foreignKey: (info) => new MovementRefNotFoundError(info.keys) },
 * })
 * export class DrizzleMovementRepository
 *   extends DrizzleBaseRepository
 *   implements MovementRepository {}
 */
export function RepositoryErrors(rules: RepositoryErrorRules): ClassDecorator {
  return (target) => {
    const proto = target.prototype as object;
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === 'constructor') continue;
      const descriptor = Object.getOwnPropertyDescriptor(proto, key);
      const original: unknown = descriptor?.value;
      if (!descriptor || typeof original !== 'function') continue;

      descriptor.value = function (this: unknown, ...args: unknown[]) {
        const result: unknown = original.apply(this, args);
        if (!(result instanceof Promise)) return result;
        return result.catch((e: unknown) => {
          throw mapRepositoryError(e, rules);
        });
      };
      Object.defineProperty(proto, key, descriptor);
    }
  };
}
