import { resolve } from 'node:path';
import { defineConfig } from 'oxlint';

const FEATURES = 'features';
const SHARED = 'shared';
const INFRASTRUCTURE = 'infrastructure';
const APPS = 'apps';

// Features are organized in groups (store, logistics, payments, finance,
// platform, iam). A group is only a folder for organization: it is NOT a
// module and has no layers of its own.
//
// A feature module path (a feature or a nested submodule) exposes one package
// per layer:
//   features/<group>/<feature>/<submodule>/.../<layer>
//
// So a module path always starts with "<group>/<feature>" (e.g. "store/order")
// and may continue with submodules (e.g. "store/order/cart").
//
// The same names are also used for the layer folders of shared:
// shared/<layer>/... (e.g. shared/impl/types, shared/impl/utils)
const LAYERS = ['api', 'impl', 'http', 'ws'] as const;

type Layer = (typeof LAYERS)[number];
type Captured = Record<string, string | string[]>;

// Module path of the importing file, e.g. "store/order" for
// features/store/order/impl/**, or "store/order/cart" for a submodule
const OWN = '{{ from.file.captured.modulePath }}';

// Parent module path of the importing file:
//   - submodule store/order/cart      -> "store/order"
//   - top-level feature store/order   -> "store" (the group)
// A parent is therefore a real module only for submodules. For a top-level
// feature the sibling pattern below matches the other features of the same
// group, which is already covered by the TOP_LEVEL policy.
const PARENT = '{{ from.file.captured.parentPath }}';

// Files of a category, optionally limited by captured values
const file = (category: string, captured?: Captured) => ({
  file: captured
    ? { categories: category, captured }
    : { categories: category },
});

// All files of a feature layer package, optionally limited to one module path
const f = (layer: Layer, captured?: Captured) => file(layer, captured);

// Only the public entry point (index.ts) of a feature layer package
const e = (layer: Layer, captured?: Captured) =>
  file(`${layer}-entry`, captured);

// ---------------------------------------------------------------------------
// Feature helpers
// ---------------------------------------------------------------------------

// api of the module the importing file belongs to
const OWN_API = e('api', { modulePath: OWN });
// api of the direct child modules only (one level below, never deeper)
const CHILD_APIS = e('api', { modulePath: `${OWN}/*` });
// api of the sibling modules only: same parent, one level
// (e.g. store/order/payment for store/order/cart). Never the parent itself,
// never a module of another feature.
// For a top-level feature (store/order) the parent is the group, so this
// matches the other features of the same group (store/catalog, ...).
const SIBLING_APIS = e('api', { modulePath: `${PARENT}/*` });

// Top-level features are "<group>/<feature>": a module path of exactly two
// segments (store/order, finance/ledger). Their siblings are every other
// top-level feature, in the same group or in another one. `*` never crosses
// a "/", so nested modules (store/order/cart) are NOT matched.
const TOP_LEVEL = (layer: Layer) => f(layer, { modulePath: '*/*' });
const TOP_LEVEL_APIS = e('api', { modulePath: '*/*' });

const ANY_FEATURE = {
  element: { type: 'feature' },
  file: { categories: 'entry' },
};
const ANY_IMPL = e('impl');

// ---------------------------------------------------------------------------
// App and infrastructure helpers
// ---------------------------------------------------------------------------

const SAME_APP = {
  element: {
    type: 'app',
    captured: { app: '{{ from.element.captured.app }}' },
  },
};

const ANY_INFRASTRUCTURE = { element: { type: 'infrastructure' } };

const SAME_INFRASTRUCTURE_ROOT = {
  element: {
    type: 'infrastructure',
    captured: { root: '{{ from.element.captured.root }}' },
  },
};

// ---------------------------------------------------------------------------
// Shared helpers
//
// shared/<name> is ONE element; everything nested below it (types/, utils/,
// ...) belongs to that element. Two kinds of shared modules exist:
//   - layer shared:  shared/api, shared/impl, shared/http, shared/ws
//   - common shared: every other folder directly under shared/
// ---------------------------------------------------------------------------

const shared = (name: string | string[]) => ({
  element: { type: 'shared', captured: { name } },
});

const ANY_SHARED = { element: { type: 'shared' } };

// shared/<layer>: only the matching feature layer may use it
const sharedLayer = (layer: Layer) => shared(layer);

// Every shared module whose name is NOT a layer name. `!(a|b)` is a micromatch
// extglob applied to the captured name ("types" matches, "impl" does not).
const COMMON_SHARED = shared(`!(${LAYERS.join('|')})`);

// ---------------------------------------------------------------------------
// External packages and node built-ins
// ---------------------------------------------------------------------------

// Only npm packages and node built-ins. Internal modules imported through
// path aliases (@store/*, @finance/*, @shared/*, ...) resolve to local files
// and are governed by the element/file policies.
const EXTERNAL = { module: { origin: ['external', 'core'] } };

// A package plus all of its subpaths: pkg('drizzle-orm') matches
// 'drizzle-orm' and 'drizzle-orm/pg-core'. Globs work too: pkg('drizzle-*').
const pkg = (name: string) => [name, `${name}/**`];

// Libraries that may be allowed somewhere. Add new ones here.
const LIBS = {
  drizzle: pkg('drizzle-orm'),
  zod: pkg('zod'),
  outbox: pkg('@nestjs/outbox'),
  nestCommon: pkg('@nestjs/common'),
};

// Files in these groups may import NO external package or node built-in,
// except the ones listed in `allow` (`core: true` also permits built-ins).
// A group with an empty `allow` may import no external code at all.
// (Here "group" means a set of rules, unrelated to the feature groups.)
const EXTERNAL_RULES: { from: object[]; allow: string[]; core?: boolean }[] = [
  // Feature layers
  { from: [f('api')], allow: [...LIBS.zod] },
  { from: [f('impl')], allow: [...LIBS.zod, ...LIBS.drizzle] },
  { from: [f('http'), f('ws')], allow: [...LIBS.zod, ...LIBS.nestCommon] },

  // Layer shared: same restrictions as the matching feature layer
  { from: [sharedLayer('api')], allow: [...LIBS.outbox, ...LIBS.zod] },
  { from: [sharedLayer('impl')], allow: [...LIBS.zod, ...LIBS.drizzle] },
  {
    from: [sharedLayer('http'), sharedLayer('ws')],
    allow: [...LIBS.zod, ...LIBS.nestCommon],
  },

  // Common shared (formerly types/utils)
  { from: [COMMON_SHARED], allow: [...LIBS.drizzle] },
];

// ---------------------------------------------------------------------------
// Violation message
// ---------------------------------------------------------------------------

// "features/<module path>" for feature files (the module path already
// contains the group, e.g. features/store/order), "<type> <name>" for the rest
const describe = (side: 'from' | 'to') =>
  `{{#if ${side}.file.captured.modulePath}}${FEATURES}/{{ ${side}.file.captured.modulePath }}` +
  `{{else}}{{ ${side}.element.types.[0] }} {{ ${side}.element.captured.root }}` +
  `{{ ${side}.element.captured.name }}{{ ${side}.element.captured.app }}{{/if}}`;

const MESSAGE =
  `${describe('from')} must not import ` +
  `{{#if to.module.source}}{{ to.module.origin }} module {{ to.module.source }}` +
  `{{else}}${describe('to')}{{/if}}`;

// ---------------------------------------------------------------------------
// Policies (default: disallow, so every policy below is an allow list)
// ---------------------------------------------------------------------------

const policies = [
  // =========================================================================
  // Same package: a layer package may always import its own files.
  // =========================================================================
  ...LAYERS.map((layer) => ({
    from: f(layer),
    allow: { to: f(layer, { modulePath: OWN }) },
  })),

  // =========================================================================
  // api: its own package (see "Same package" above) plus the api (index.ts
  // only) of the direct child modules. No siblings, no parent, no
  // grandchildren.
  // =========================================================================
  { from: f('api'), allow: { to: CHILD_APIS } },

  // =========================================================================
  // impl / http / ws: the api (index.ts only) of
  //   - their own module
  //   - the direct child modules
  //   - the sibling modules (same parent)
  //
  // Top-level features (<group>/<feature>) additionally get the api of every
  // other top-level feature, in their own group or in any other group
  // (features/store/order -> features/finance/ledger/api). Their parent is
  // only the group folder, so SIBLING_APIS alone would not cross groups.
  //
  // To keep siblings closed for a layer, drop SIBLING_APIS / the TOP_LEVEL
  // policy for that layer (e.g. split this block per layer).
  // =========================================================================
  ...(['impl', 'http', 'ws'] as const).flatMap((layer) => [
    { from: f(layer), allow: { to: [OWN_API, CHILD_APIS, SIBLING_APIS] } },
    { from: TOP_LEVEL(layer), allow: { to: TOP_LEVEL_APIS } },
  ]),

  // =========================================================================
  // Feature layer -> shared/<same layer>, and nothing else in shared.
  // (api -> shared/api, impl -> shared/impl, http -> shared/http,
  //  ws -> shared/ws). Common shared is NOT directly reachable from features.
  // =========================================================================
  ...LAYERS.map((layer) => ({
    from: f(layer),
    allow: { to: sharedLayer(layer) },
  })),

  // =========================================================================
  // App: its own files plus everything nested in features, infrastructure
  // and shared
  // =========================================================================
  {
    from: { element: { type: 'app' } },
    allow: { to: [SAME_APP, ANY_FEATURE, ANY_INFRASTRUCTURE, ANY_SHARED] },
  },

  // =========================================================================
  // Infrastructure: its own root, shared, and every nested feature impl
  // =========================================================================
  {
    from: { element: { type: 'infrastructure' } },
    allow: { to: [SAME_INFRASTRUCTURE_ROOT, ANY_SHARED, ANY_IMPL] },
  },

  // =========================================================================
  // Shared:
  //  - every shared module may import itself. Since this is the only thing
  //    allowed by default, shared/{api,impl,http,ws} can NOT import each other
  //  - every layer shared module may additionally import common shared
  //    (any shared/<name> where name is not a layer)
  //  - common shared may only import itself
  // =========================================================================
  {
    from: { element: { type: 'shared' } },
    allow: { to: shared('{{ from.element.captured.name }}') },
  },
  { from: shared([...LAYERS]), allow: { to: COMMON_SHARED } },

  // =========================================================================
  // External packages (the last matching policy wins): free everywhere,
  // then closed for every group in EXTERNAL_RULES, then reopened per `allow`
  // =========================================================================
  { allow: { to: EXTERNAL } },
  ...EXTERNAL_RULES.flatMap(({ from }) =>
    from.map((group) => ({ from: group, disallow: { to: EXTERNAL } })),
  ),
  ...EXTERNAL_RULES.flatMap(({ from, allow, core }) =>
    from.flatMap((group) => [
      ...(allow.length > 0
        ? [
            {
              from: group,
              allow: { to: { module: { origin: 'external', source: allow } } },
            },
          ]
        : []),
      ...(core
        ? [{ from: group, allow: { to: { module: { origin: 'core' } } } }]
        : []),
    ]),
  ),
];

export default defineConfig({
  jsPlugins: [
    { name: 'boundaries', specifier: 'eslint-plugin-boundaries' },
    { name: 'impl', specifier: './.tools/oxlint-plugins/impl.mjs' },
    { name: 'nest', specifier: './.tools/oxlint-plugins/nest.mjs' },
  ],

  settings: {
    'boundaries/root-path': resolve(import.meta.dirname),

    // All TypeScript files of the modules (config files live in the root)
    'boundaries/include': [
      `${APPS}/*/**/*.ts`,
      `${FEATURES}/**/*.ts`,
      `${INFRASTRUCTURE}/**/*.ts`,
      `${SHARED}/**/*.ts`,
    ],

    'boundaries/ignore': ['**/*.{test,spec}.ts'],

    'boundaries/legacy-templates': false,

    // -----------------------------------------------------------------------
    // Elements
    // -----------------------------------------------------------------------
    'boundaries/elements': [
      {
        type: 'app',
        pattern: `${APPS}/*`,
        partialMatch: false,
        capture: ['app'],
      },
      // features/<group>/<feature>: one element per top-level feature.
      // Everything nested below it (submodules, layers) belongs to it.
      // The group folder itself is not an element.
      {
        type: 'feature',
        pattern: `${FEATURES}/*/*`,
        partialMatch: false,
        capture: ['group', 'root'],
      },
      {
        type: 'infrastructure',
        pattern: `${INFRASTRUCTURE}/*`,
        partialMatch: false,
        capture: ['root'],
      },
      // shared/<name>: one element per first-level folder (api, impl, http,
      // ws, and any common folder). Nested folders such as shared/impl/types
      // belong to the element of their first-level folder.
      {
        type: 'shared',
        pattern: `${SHARED}/*`,
        partialMatch: false,
        capture: ['name'],
      },
    ],

    // -----------------------------------------------------------------------
    // File categories
    // -----------------------------------------------------------------------
    'boundaries/files': [
      // Feature layers: features/<modulePath>/<layer>/**
      // where <modulePath> = <group>/<feature>[/<submodule>...]
      ...LAYERS.map((layer) => ({
        pattern: `${FEATURES}/**/${layer}/**`,
        category: layer,
        capture: ['modulePath'],
      })),

      // Public entry point of every layer package:
      // features/<modulePath>/<layer>/index.ts
      ...LAYERS.map((layer) => ({
        pattern: `${FEATURES}/**/${layer}/index.ts`,
        category: `${layer}-entry`,
        capture: ['modulePath'],
      })),

      // Any layer entry point (for app -> feature)
      ...LAYERS.map((layer) => ({
        pattern: `${FEATURES}/**/${layer}/index.ts`,
        category: 'entry',
      })),

      // Parent module path of every layer file (for sibling access):
      // features/<parentPath>/<name>/<layer>/**
      // Only the first `**` is captured; the `*` is the module's own name.
      //   features/store/order/cart/impl -> parentPath "store/order"
      //   features/store/order/impl      -> parentPath "store" (the group)
      ...LAYERS.map((layer) => ({
        pattern: `${FEATURES}/**/*/${layer}/**`,
        category: layer,
        capture: ['parentPath'],
      })),
    ],

    'import/resolver': {
      oxc: {
        tsconfig: { configFile: './tsconfig.json', references: 'auto' },
        extensions: ['.ts'],
      },
    },
  },

  rules: {
    'boundaries/dependencies': [
      'error',
      {
        default: 'disallow',
        checkAllOrigins: true,
        checkInternals: true,
        message: MESSAGE,
        policies,
      },
    ],

    'boundaries/no-unknown-dependencies': 'error',

    'typescript/no-explicit-any': 'off',
    'typescript/no-floating-promises': 'error',
    'no-unused-vars': [
      'error',
      { fix: { imports: 'safe-fix', variables: 'off' } },
    ],
  },

  categories: { correctness: 'error' },

  env: { node: true, es2022: true },

  ignorePatterns: ['**/node_modules'],

  options: { typeAware: true, reportUnusedDisableDirectives: 'warn' },
});
