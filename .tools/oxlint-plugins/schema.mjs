// Rule: a module schema (features/<group>/<feature>[/<submodule>...]/schema/**)
// must not export the schema of another module.
//
// Import access between schemas is free (see oxlint_config.ts), but a schema
// must not hand another module's tables on to its own importers:
//   export * from '@commerce/catalog/schema';              // reported
//   export { products } from '@commerce/catalog/schema';   // reported
//   import { products } from '@commerce/catalog/schema';
//   export { products };                                   // reported
//   export default products;                               // reported
// Re-exporting files of the OWN schema (relative paths staying inside it) and
// of the group schema (features/<group>/schema) is allowed.
//
// Not detected: building a new value from a foreign table
// (`export const x = products;`). Treat that one in code review.

import path from 'node:path';

const MODULE_SCHEMA_FILE = /(?:^|\/)features\/(.+?)\/schema\/.*$/;

// Alias of a module schema: @<group>/<feature>[/<submodule>...]/schema[/...]
// (@<group>/schema is the group schema and does not match: it has no module
// segment between the group and "schema").
const MODULE_SCHEMA_ALIAS = /^@[^/]+\/.+\/schema(?:\/.*)?$/;
const NOT_FEATURE_ALIAS = /^@(?:shared|infrastructure)\//;

function describeFile(filename) {
  const file = filename.replaceAll('\\', '/');
  const match = MODULE_SCHEMA_FILE.exec(file);
  if (!match) return null;

  const modulePath = match[1];
  const [group, ...rest] = modulePath.split('/');
  // A single segment is the group schema (features/<group>/schema), not a
  // module schema.
  if (rest.length === 0) return null;

  const start = match[0].startsWith('/') ? match.index + 1 : match.index;
  const featuresDir = `${file.slice(0, start)}features`;

  return {
    file,
    ownAlias: `@${group}/${rest.join('/')}/schema`,
    ownSchemaDir: `${featuresDir}/${modulePath}/schema`,
    groupSchemaDir: `${featuresDir}/${group}/schema`,
  };
}

const isInside = (target, dir) => target === dir || target.startsWith(`${dir}/`);

function isForeign(source, info) {
  if (typeof source !== 'string') return false;

  if (source.startsWith('.')) {
    const target = path.posix.normalize(
      path.posix.join(path.posix.dirname(info.file), source),
    );
    return (
      !isInside(target, info.ownSchemaDir) &&
      !isInside(target, info.groupSchemaDir)
    );
  }

  if (NOT_FEATURE_ALIAS.test(source) || !MODULE_SCHEMA_ALIAS.test(source)) {
    return false;
  }
  return source !== info.ownAlias && !source.startsWith(`${info.ownAlias}/`);
}

const noForeignSchemaExport = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A module schema must not export the schema of another module',
    },
    schema: [],
  },

  create(context) {
    const filename =
      context.physicalFilename ?? context.filename ?? context.getFilename();
    const info = describeFile(filename);
    if (!info) return {};

    const imported = new Map(); // local name -> import source
    const exportedLocals = []; // { node, name }

    const reportFrom = (node, source) =>
      context.report({
        node,
        message:
          `A module schema must not export the schema of another module ` +
          `(${source}). Import it where it is needed instead.`,
      });

    return {
      ImportDeclaration(node) {
        for (const specifier of node.specifiers) {
          imported.set(specifier.local.name, node.source.value);
        }
      },

      ExportAllDeclaration(node) {
        if (isForeign(node.source.value, info)) {
          reportFrom(node, node.source.value);
        }
      },

      ExportNamedDeclaration(node) {
        if (node.source) {
          if (isForeign(node.source.value, info)) {
            reportFrom(node, node.source.value);
          }
          return;
        }
        for (const specifier of node.specifiers) {
          exportedLocals.push({
            node: specifier,
            name: specifier.local.name ?? specifier.local.value,
          });
        }
      },

      ExportDefaultDeclaration(node) {
        if (node.declaration?.type === 'Identifier') {
          exportedLocals.push({ node, name: node.declaration.name });
        }
      },

      // Imports are hoisted, so check the exports after the whole file is read
      'Program:exit'() {
        for (const { node, name } of exportedLocals) {
          const source = imported.get(name);
          if (source !== undefined && isForeign(source, info)) {
            reportFrom(node, source);
          }
        }
      },
    };
  },
};

export default {
  meta: { name: 'schema' },
  rules: { 'no-foreign-schema-export': noForeignSchemaExport },
};
