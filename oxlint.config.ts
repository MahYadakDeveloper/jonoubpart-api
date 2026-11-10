import { resolve } from 'node:path';
import { defineConfig } from 'oxlint';

const FEATURES = 'features';
const SHARED = 'shared';
const INFRASTRUCTURE = 'infrastructure';
const APPS = 'apps';

// Features are organized in groups (commerce, logistics, payments, finance,
// platform, iam). A group is only a folder for organization: it is NOT a
// module and has no layers of its own. Its only package is the group schema
// (features/<group>/schema, see below).
//
// A feature module path (a feature or a nested submodule) exposes one package
// per layer:
//   features/<group>/<feature>/<submodule>/.../<layer>
//
// So a module path always starts with "<group>/<feature>" (e.g. "commerce/order")
// and may continue with submodules (e.g. "commerce/order/cart").
//
// ENTRY POINT RULE (every cross-package import):
// a file may import a file of ANOTHER package only through the public entry
// point (index.ts) of that package:
//   - feature layer package   features/<modulePath>/<layer>/index.ts
//   - group schema            features/<group>/schema/index.ts
//   - shared module           shared/<name>/index.ts
//   - infrastructure module   infrastructure/<name>/index.ts
// Files of the SAME package (same layer of the same module, same shared
// module, same infrastructure module, same app) may import each other freely.
// The path aliases in tsconfig.json point at entry points only.
//
// Code layers of a feature module: api, impl, http, ws, schema.
// The same names are also used for the layer folders of shared:
// shared/<layer>/... (e.g. shared/impl/types, shared/schema)
//
// Settings are NOT a layer: a module's settings are a regular submodule
// (features/<modulePath>/settings) with its own layers, e.g.
// features/commerce/order/settings/{api,impl,http}. They follow the normal
// submodule rules: the parent module (commerce/order) and the sibling modules
// (commerce/order/cart, ...) reach commerce/order/settings/api through its
// entry point (siblings: type-only imports from an api, see the api policies).
const CODE_LAYERS = ['api', 'impl', 'http', 'ws', 'schema'] as const;

// Layers of a feature module (same list as CODE_LAYERS). `schema` holds the
// Drizzle tables of the module. Like every other layer it is imported only
// through its entry point (schema/index.ts, the @<group>/*/schema alias).
//   - schema -> entry of the schema of ANY module (free, e.g. for foreign keys)
//   - api, impl, http, ws -> entry of the schema of their OWN module only
// A module schema must not re-export the schema of another module; that is
// not an import rule, it is checked by the schema/no-foreign-schema-export
// rule (.tools/oxlint-plugins/schema.mjs).
const LAYERS = [...CODE_LAYERS] as const;

type Layer = (typeof LAYERS)[number];
type CodeLayer = (typeof CODE_LAYERS)[number];
type Captured = Record<string, string | string[]>;

// Module path of the importing file, e.g. "commerce/order" for
// features/commerce/order/impl/**, or "commerce/order/cart" for a submodule
const OWN = '{{ from.file.captured.modulePath }}';

// Parent module path of the importing file:
//   - submodule commerce/order/cart      -> "commerce/order"
//   - top-level feature commerce/order   -> "commerce" (the group)
// A parent is therefore a real module only for submodules. For a top-level
// feature the sibling pattern below matches the other features of the same
// group, which is already covered by the TOP_LEVEL policy.
const PARENT = '{{ from.file.captured.parentPath }}';

// Group schema: features/<group>/schema/index.ts
// One shared schema package per group (shared tables, table-building helpers,
// ...). It is NOT a feature module and has no layers. It may be imported
// through its public entry point (index.ts) only by the schema layer of every
// module of the SAME group (nested submodules too) and by shared/schema (any
// group), and by nobody else. The group schema itself may import its own
// files, drizzle-orm and the entry point of shared/schema.
// Because of this the name "schema" is reserved: a group cannot have a
// feature called "schema".

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
// (e.g. commerce/order/payment for commerce/order/cart). Never the parent itself,
// never a module of another feature.
// For a top-level feature (commerce/order) the parent is the group, so this
// matches the other features of the same group (commerce/catalog, ...).
const SIBLING_APIS = e('api', { modulePath: `${PARENT}/*` });

// Top-level features are "<group>/<feature>": a module path of exactly two
// segments (commerce/order, finance/ledger). Their siblings are every other
// top-level feature, in the same group or in another one. `*` never crosses
// a "/", so nested modules (commerce/order/cart) are NOT matched.
const TOP_LEVEL = (layer: Layer) => f(layer, { modulePath: '*/*' });
const TOP_LEVEL_APIS = e('api', { modulePath: '*/*' });

const ANY_FEATURE = {
  element: { type: 'feature' },
  file: { categories: 'entry' },
};
const ANY_IMPL = e('impl');

// Entry point (index.ts) of the group schema of ANY group
const ANY_GROUP_SCHEMA_ENTRY = {
  element: { type: 'group-schema' },
  file: { categories: 'group-schema-entry' },
};

// Schema layer of a module. Files of a group schema (features/<group>/schema)
// also get the `schema` category, but their modulePath is only "<group>" (one
// segment), so MODULE_SCHEMA requires at least two segments ("<group>/<feature>"
// and deeper) to match module schemas only.
const MODULE_SCHEMA = f('schema', { modulePath: '*/**' });
// Entry point (schema/index.ts) of the schema of ANY module, and of the module
// the importing file belongs to
const MODULE_SCHEMA_ENTRY = e('schema', { modulePath: '*/**' });
const OWN_SCHEMA = e('schema', { modulePath: OWN });

// Group schema element (any group) and its entry point in the same group as
// the importing file. The capture is called `schemaGroup` (not `group`, which
// the feature element uses) so it can be told apart in violation messages.
const GROUP_SCHEMA = { element: { type: 'group-schema' } };

const SAME_GROUP_SCHEMA_ENTRY = {
  element: {
    type: 'group-schema',
    captured: { schemaGroup: '{{ from.element.captured.group }}' },
  },
  file: { categories: 'group-schema-entry' },
};

// Files of the same group schema as the importing group schema file
const OWN_GROUP_SCHEMA = {
  element: {
    type: 'group-schema',
    captured: { schemaGroup: '{{ from.element.captured.schemaGroup }}' },
  },
};

// ---------------------------------------------------------------------------
// App and infrastructure helpers
// ---------------------------------------------------------------------------

const SAME_APP = {
  element: {
    type: 'app',
    captured: { app: '{{ from.element.captured.app }}' },
  },
};

// Any file of the same infrastructure module as the importing file
const SAME_INFRASTRUCTURE = {
  element: {
    type: 'infrastructure',
    captured: { root: '{{ from.element.captured.root }}' },
  },
};

// Entry point (infrastructure/<name>/index.ts) of ANY infrastructure module
const ANY_INFRASTRUCTURE_ENTRY = {
  element: { type: 'infrastructure' },
  ...file('infrastructure-entry'),
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

// Only the entry point (shared/<name>/index.ts) of a shared module. Use it on
// the `to` side of a policy. Plain shared() matches every file of the module
// and is meant for the `from` side and for a module's own files.
const sharedEntry = (name: string | string[]) => ({
  ...shared(name),
  ...file('shared-entry'),
});

const ANY_SHARED_ENTRY = { element: { type: 'shared' }, ...file('shared-entry') };

// shared/<layer>: the matching feature layer may use it (see the policies)
const sharedLayer = (layer: CodeLayer) => shared(layer);
const sharedLayerEntry = (layer: CodeLayer) => sharedEntry(layer);

// Every shared module whose name is NOT a layer name. `!(a|b)` is a micromatch
// extglob applied to the captured name ("types" matches, "impl" does not).
const COMMON_SHARED_NAME = `!(${CODE_LAYERS.join('|')})`;
const COMMON_SHARED = shared(COMMON_SHARED_NAME);
const COMMON_SHARED_ENTRY = sharedEntry(COMMON_SHARED_NAME);

// ---------------------------------------------------------------------------
// External packages and node built-ins
// ---------------------------------------------------------------------------

// Only npm packages and node built-ins. Internal modules imported through
// path aliases (@commerce/*, @finance/*, @shared/*, ...) resolve to local files
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
  { from: [f('impl')], allow: [...LIBS.zod, ...LIBS.drizzle, ...LIBS.outbox] },
  {
    from: [f('http'), f('ws')],
    allow: [...LIBS.zod, ...LIBS.nestCommon, ...LIBS.drizzle],
  },
  { from: [MODULE_SCHEMA], allow: [...LIBS.drizzle] },

  // Group schema: table definitions and helpers
  { from: [GROUP_SCHEMA], allow: [...LIBS.drizzle] },

  // Layer shared: same restrictions as the matching feature layer
  { from: [sharedLayer('api')], allow: [...LIBS.outbox, ...LIBS.zod] },
  { from: [sharedLayer('impl')], allow: [...LIBS.zod, ...LIBS.drizzle] },
  { from: [sharedLayer('schema')], allow: [...LIBS.drizzle, ...LIBS.outbox] },
  {
    from: [sharedLayer('http'), sharedLayer('ws')],
    allow: [...LIBS.zod, ...LIBS.nestCommon, ...LIBS.drizzle],
  },

  // Common shared (formerly types/utils)
  { from: [COMMON_SHARED], allow: [...LIBS.drizzle] },
];

// ---------------------------------------------------------------------------
// Violation message
// ---------------------------------------------------------------------------

// "features/<module path>" for feature files (the module path already
// contains the group, e.g. features/commerce/order), "<type> <name>" for the rest
const describe = (side: 'from' | 'to') =>
  `{{#if ${side}.file.captured.modulePath}}${FEATURES}/{{ ${side}.file.captured.modulePath }}` +
  `{{else}}{{ ${side}.element.types.[0] }} {{ ${side}.element.captured.root }}` +
  `{{ ${side}.element.captured.name }}{{ ${side}.element.captured.app }}` +
  `{{ ${side}.element.captured.schemaGroup }}{{/if}}`;

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
  // api: its own package (see "Same package" above), plus
  //   - the api (index.ts only) of the direct child modules (any import)
  //   - the api (index.ts only) of the sibling modules, TYPE-ONLY imports
  //     (`import type { X }`); value imports of a sibling api stay forbidden.
  // Top-level features (<group>/<feature>) get the same type-only access to
  // every other top-level feature, in any group (see the impl/http/ws block).
  // No parent, no grandchildren.
  // =========================================================================
  { from: f('api'), allow: { to: CHILD_APIS } },
  { from: f('api'), allow: { to: SIBLING_APIS, dependency: { kind: 'type' } } },
  {
    from: TOP_LEVEL('api'),
    allow: { to: TOP_LEVEL_APIS, dependency: { kind: 'type' } },
  },

  // =========================================================================
  // shared/schema: besides itself (see the Shared block) it may import ONLY
  // the group schemas (entry point only, any group). Nothing else: no feature
  // layer, no module schema, no other shared module.
  // =========================================================================
  { from: shared('schema'), allow: { to: ANY_GROUP_SCHEMA_ENTRY } },

  // =========================================================================
  // impl / http / ws: the api (index.ts only) of
  //   - their own module
  //   - the direct child modules
  //   - the sibling modules (same parent)
  //
  // Top-level features (<group>/<feature>) additionally get the api of every
  // other top-level feature, in their own group or in any other group
  // (features/commerce/order -> features/finance/ledger/api). Their parent is
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
  // Schema access (entry point schema/index.ts only):
  //  - api, impl, http and ws: the schema of their OWN module. Not
  //    the schema of child modules, siblings, the parent or other features.
  //  - module schema: the schema of ANY module (free, e.g. for foreign keys)
  // =========================================================================
  ...CODE_LAYERS.map((layer) => ({
    from: f(layer),
    allow: { to: OWN_SCHEMA },
  })),
  { from: MODULE_SCHEMA, allow: { to: MODULE_SCHEMA_ENTRY } },

  // =========================================================================
  // Group schema (entry point only, same group only):
  //  - module schema of every module of the group, nested submodules included
  //  - the group schema itself may import only its own files
  // =========================================================================
  { from: MODULE_SCHEMA, allow: { to: SAME_GROUP_SCHEMA_ENTRY } },
  { from: GROUP_SCHEMA, allow: { to: OWN_GROUP_SCHEMA } },

  // =========================================================================
  // Feature layer -> shared (entry point shared/<name>/index.ts only):
  //  - every layer: shared/<same layer> (api -> shared/api, impl -> shared/impl,
  //    http -> shared/http, ws -> shared/ws, schema -> shared/schema).
  //    impl no longer gets shared/api.
  //  - impl, http, ws additionally: common shared (every shared module whose
  //    name is not a layer name, e.g. shared/types, shared/utils)
  //  - api, schema: their own shared layer ONLY (no common shared)
  // =========================================================================
  ...CODE_LAYERS.map((layer) => ({
    from: f(layer),
    allow: { to: sharedLayerEntry(layer) },
  })),
  ...(['impl', 'http', 'ws'] as const).map((layer) => ({
    from: f(layer),
    allow: { to: COMMON_SHARED_ENTRY },
  })),

  // =========================================================================
  // App: any file of its own app, plus the entry points of features (any code
  // layer), infrastructure and shared
  // =========================================================================
  {
    from: { element: { type: 'app' } },
    allow: {
      to: [SAME_APP, ANY_FEATURE, ANY_INFRASTRUCTURE_ENTRY, ANY_SHARED_ENTRY],
    },
  },

  // =========================================================================
  // Infrastructure: any file of its own module, the entry point of any other
  // infrastructure module, the entry point of shared, and the impl entry of
  // every nested feature
  // =========================================================================
  {
    from: { element: { type: 'infrastructure' } },
    allow: {
      to: [
        SAME_INFRASTRUCTURE,
        ANY_INFRASTRUCTURE_ENTRY,
        ANY_SHARED_ENTRY,
        ANY_IMPL,
      ],
    },
  },

  // =========================================================================
  // Shared:
  //  - every shared module may import itself (any file of it). Since this is
  //    the only thing allowed by default, shared/{api,impl,http,ws,schema}
  //    can NOT import each other
  //  - every layer shared module may additionally import the entry point of
  //    common shared (any shared/<name> where name is not a layer)
  //  - shared/schema may also import the group schemas (see its own block)
  //  - common shared may only import itself
  // =========================================================================
  {
    from: { element: { type: 'shared' } },
    allow: { to: shared('{{ from.element.captured.name }}') },
  },
  { from: shared([...CODE_LAYERS]), allow: { to: COMMON_SHARED_ENTRY } },

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
    { name: 'schema', specifier: './.tools/oxlint-plugins/schema.mjs' },
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
      // features/<group>/schema: one element per group. It must be listed
      // BEFORE the feature element, because features/*/* also matches
      // features/<group>/schema.
      {
        type: 'group-schema',
        pattern: `${FEATURES}/*/schema`,
        partialMatch: false,
        capture: ['schemaGroup'],
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

      // Public entry point of every code layer package (schema included):
      // features/<modulePath>/<layer>/index.ts
      ...CODE_LAYERS.map((layer) => ({
        pattern: `${FEATURES}/**/${layer}/index.ts`,
        category: `${layer}-entry`,
        capture: ['modulePath'],
      })),

      // Public entry point of a group schema: features/<group>/schema/index.ts
      {
        pattern: `${FEATURES}/*/schema/index.ts`,
        category: 'group-schema-entry',
      },

      // Public entry point of a shared module and of an infrastructure module
      { pattern: `${SHARED}/*/index.ts`, category: 'shared-entry' },
      {
        pattern: `${INFRASTRUCTURE}/*/index.ts`,
        category: 'infrastructure-entry',
      },

      // Any code layer entry point (for app -> feature)
      ...CODE_LAYERS.map((layer) => ({
        pattern: `${FEATURES}/**/${layer}/index.ts`,
        category: 'entry',
      })),

      // Parent module path of every layer file (for sibling access):
      // features/<parentPath>/<name>/<layer>/**
      // Only the first `**` is captured; the `*` is the module's own name.
      //   features/commerce/order/cart/impl -> parentPath "commerce/order"
      //   features/commerce/order/impl      -> parentPath "commerce" (the group)
      ...CODE_LAYERS.map((layer) => ({
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

    // A module schema must not re-export the schema of another module
    'schema/no-foreign-schema-export': 'error',

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
