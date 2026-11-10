# AGENT.md

Guidance for AI coding agents working in the **jonoubpart** repository. Read this before making changes. When something here conflicts with what you see in neighboring code, follow the neighboring code and flag the difference.

## 1. Project overview

- **jonoubpart-api**: NestJS **modular monolith** (Drizzle ORM, PostgreSQL, Redis). Business areas include store/POS, orders, payments, wallet, warehouse, delivery, locations, media and IAM.
- **jonoubpart-clients**: Expo apps (3 Android apps, e.g. `apps/customer-mobile`) and a Next.js web app for the consumer role. UI is shared across apps with Tamagui.
- **Planned**: both live in one repo (`api/`, `clients/`, `packages/contracts`). The HTTP contract between server and clients is a shared Zod package, `@jonoubpart/contracts`. If this layout is not in place yet, treat it as the target, not as a fact.

## 2. Tooling rules (important)

- **Always use Bun** as package manager and runtime. Use `bun add`, `bun install`, `bun run`, `bunx`. Never suggest `npm`, `pnpm`, `yarn`, `npx` or plain `node` commands in examples or scripts.
- Install from the **repo root only**. Never run `bun install` inside a sub-package. Install a single package's deps with `bun install --filter <path-or-name>`.
- One lockfile (`bun.lock`) at the root. Do not create or commit other lockfiles or `pnpm-*` files.
- Shared dependency versions come from the root `catalog` (`"zod": "catalog:"`). Internal packages use `"workspace:*"`.
- Node must remain installed for the React Native / Expo / Gradle toolchain even though Bun is the runtime.
- Work inside WSL2 on the Linux filesystem (`~/dev/...`), not under `/mnt/c`.
- Check each package's `package.json` `scripts` for the real build, test, lint and typecheck commands before inventing one.
- Linter: **oxlint** (type-aware via oxlint-tsgolint). Config is layered: a base config for api modules and one for http modules (`@repo/oxlint-config`), and every feature module's `.oxlintrc.json` extends the right one. Do not disable rules inline to make code pass; fix the code or ask.
- TypeScript: strict, including `noUncheckedIndexedAccess`. Handle `undefined` from indexed access and regex matches explicitly; do not use `!` to silence it.

## 3. Backend architecture

### Layers

1. **app**: `AppModule` and feature modules that wire things together (controllers, decorators, authorization/roles).
2. **feature**: business modules, each split into `:api` and `:impl` (see below).
3. **infrastructure**: crypto, DB (Drizzle, including `/schema`), and other technical concerns.

### Feature rules

- Every feature is split into **`api`** (contracts: interfaces, types, DI tokens, domain errors) and **`impl`** (services/commands, repositories).
- `impl` implements its **own** `api`.
- Features may depend on **other features' `api` only**, never on their `impl`.
- App-layer feature modules depend on `impl`.
- `impl` may use infrastructure (crypto, DB). `api` packages depend only on `@feature/shared` and `@infra/schema` (and each other's `api`).
- Features can have optional layers `http` and `ws` (HTTP controllers / WebSocket gateways). Controllers live in the module that owns them.
- Features are being grouped into categories above the feature level (not bounded contexts, no api/impl of their own): `store` (pos, order, cashier, ...), `logistics` (warehouse, delivery, manager), `finance` (ledger, accounting), `platform` (media, ...), `iam` (authentication, authorization). Payment gateway and wallet are kept separate. Path aliases are per group (`@store/*`, `@finance/*`, ...), not a single `@features/*`.

### Shared code

- `shared/` has per-layer folders: `shared/{impl,http,ws,api}`, plus non-layer shared folders.
- Boundary rule (oxlint `boundaries`): a feature layer X may import only `shared/X`. Shared layer folders must not import each other, but may import non-layer shared folders. Respect this; do not add cross-layer imports.

### Package conventions

- Feature `api` package: `@feature/<path>-api`, `private: true`, `type: commonjs`, `exports: { "./*": "./src/*/index.ts" }`, dependencies limited to `@feature/shared` and `@infra/schema` (`workspace:*`), devDependency `@repo/oxlint-config`.
- Errors package: `@feature/<x>-errors`. Http package: `@feature/<y>-<x>-http` (or `@feature/<x>-http` without a group).
- A layer-scoped naming scheme (`@feature.<layer>/<feature>`) has been proposed. Follow whichever scheme the neighboring packages already use.
- Package names cannot contain `:`; the `:api` / `:impl` notation in docs is conceptual only.
- Prefer the **generator scripts** (below) over copying packages by hand.

### Commands (use-case classes)

- Business operations are **Command classes**: a generic `Command<TInput, TOutput>` interface with an `execute` method, shared across modules. Do not write fat services.
- Commands depend on repositories and the transaction context. `XApiImpl` delegates to commands.
- Read side (queries) may hit the DB directly with Drizzle, without extra layers. Types come from the controller (`StockQueries implements ControllerQueries<StockController>`, per-query classes like `ListStocksQuery`). Zod schemas are defined once (single source).

## 4. Database and repositories

- ORM: Drizzle with PostgreSQL. Schemas live in the infrastructure `schema` area, grouped by schema namespace (e.g. `actorsSchema`, `orderSchema`).
- Repositories extend the abstract **`DrizzleBaseRepository`**:
  - `db` getter returns the current transaction if one is active, otherwise the database.
  - `transaction()` uses propagation `REQUIRED`.
  - `applyLockConditionally` applies `FOR UPDATE` (with `of`) when a lock is requested.
- Transactions are carried by `DrizzleTransactionAls` (AsyncLocalStorage), provided as a singleton by the `@Global` `DrizzleDbModule`. Never pass transaction objects around manually.
- Drizzle `update` statements must use `returning` (an oxlint rule enforces this).
- **Error mapping**: Postgres errors are mapped to domain/repository errors with the `@RepositoryErrors` decorator (`RepositoryErrorKind/Info/Rules`, `mapRepositoryError`, in `shared/impl/repository-errors`). The dialect-specific classifier (`classifyPgError`) stays in infrastructure behind a port registered at bootstrap. Use the decorator on repository classes that implement a repository interface; keep mapping out of method bodies so repository files stay uncluttered.
- Reference constraint names type-safely, not as loose strings.
- Distributed locks use `RedlockSynchronizer` (`redlock-universal` on node-redis). The node-redis client is injected via the `REDIS_CLIENT` token; the URL comes from `REDIS_URL`.
- Seeding and one-off jobs run through the CLI (below), never in `onModuleInit`.

## 5. Errors

- Domain code throws **domain errors from the `api` layer**, never Nest `HttpException`s. Mapping to HTTP happens in the `http` layer.
- Naming: describe the business condition, not the HTTP status. Format `<Subject><Condition>Error` (`MovementNotFoundError`, `WalletInsufficientBalanceError`). Use `Failure` only for a generic failure that takes a `reason`. The error code mirrors the name (`MOVEMENT_NOT_FOUND`). One class per distinct client behavior; put detail in `params`.
- Base categories come from `@feature/shared/errors`: `EntityNotFoundError` (404), `ConflictError` (409), `BusinessRuleViolationError` (422), `ForbiddenError` (403). They are mapped by default through `CATEGORY_ERROR_MAPPINGS` in `@feature/error-http`. An error extending `DomainError` directly needs an explicit mapping in `X_ERROR_MAPPINGS`.
- Declare mappings with `errorsWithKeys` from `@feature/error-http` (usable as an array and as a lookup by error name).
- Document thrown errors on API methods with `@throws` comments.

## 6. Generators and CLI

- **Errors module generator**: creates `@feature/<x>-errors` (error classes by category, `X_ERROR_MAPPINGS`, package/tsconfig/oxlint files, and a commented list of 4xx errors at the end of the generated file).
- **Http module generator**: takes module name `x` and optional group `y`. Creates policy files (CASL ability factory and policy), DTO, command, `x.http.module.ts`, controller (`PoliciesGuard` + `CheckPolicies`), `.oxlintrc.json` extending `@repo/oxlint-config/http.json`, `package.json`, `tsconfig.json`, then runs `bun install --filter` for the new package. Route is `y/x` or `x`. tsconfig extends the root one (3 levels up directly under `feature/`, 4 under `feature/y`).
- CLIs use **nest-commander** with one root entry and grouped subcommands (e.g. `seed locations`).

## 7. Frontend (jonoubpart-clients)

- Expo (SDK 58 at the time of writing) apps and a Next.js web app, in a Bun workspace. Do not hand-write Metro `watchFolders` / `nodeModulesPaths`; Expo configures monorepos itself.
- Shared UI uses Tamagui; MDX uses `@bacons/mdx` and `@bacons/mdx/server`.
- After structural changes run `bunx expo start --clear`.
- Android builds run locally with Gradle (maven mirror `maven.myket.ir`), with the adb server on Windows. Do not change mirror or Gradle plugin config in `.tools` without being asked.
- Next.js consumes workspace TypeScript sources, so shared packages must be listed in `transpilePackages`.

## 8. Shared API contract (`@jonoubpart/contracts`, target design)

- Source of truth for HTTP request/response schemas and error codes, written in **Zod 4**. OpenAPI is generated later from it if needed, never the other way around.
- Depends **only on `zod`**. No Nest, Drizzle, React Native or `node:*` imports. Never export Drizzle table schemas or internal fields (password hashes, internal ids, admin flags).
- Only the `http` layer (and `api` if needed) of the backend imports it, never `impl`. Clients import feature subpaths (`@jonoubpart/contracts/auth`), not a giant barrel.
- Error envelope: `{ code: string, message: string, details?: unknown }`. On the wire `code` is `z.string()`, not `z.enum`, so new codes do not break old app versions. Codes are **only ever added**, never renamed or removed. Clients must degrade gracefully on unknown codes.
- Changes must be **additive** (old mobile apps stay installed). New request fields are optional or defaulted; new response enum values must be tolerated by clients. Breaking changes need `/v2` or a forced app update.
- Change the contract, server and clients in the **same PR**.

## 9. Code style

- Comments in **English**, short, explaining why rather than what.
- Do not clutter repository and controller methods with cross-cutting plumbing; use decorators and module-level configuration.
- Keep contracts (interfaces, ports) in one place per API (e.g. a single `WarehouseApi` class/file), and keep the owning module independent of its consumers' context.
- Prefer small, focused changes. Do not reformat unrelated files.

## 10. Before you finish a task

1. Typecheck and lint the packages you touched (`bun run` the package's scripts).
2. Make sure no forbidden import crossed a layer or `api`/`impl` boundary.
3. If you changed a contract, confirm both the server and every client that uses it still compile.
4. If you added a dependency, use `bun add` (from the package directory) and prefer the root catalog for shared versions.
5. Report what you changed, what you could not verify, and any assumption you made.

## 11. Ask first

Stop and ask before: renaming or removing a public error code or API method, changing DB schema or migrations, adding a new top-level dependency or a new feature group, changing lint boundaries, touching Gradle or `.tools` config, or restructuring the workspace.
