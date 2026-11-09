import { getTableName, sql } from 'drizzle-orm';
import { AnyPgColumn, check, PgTable } from 'drizzle-orm/pg-core';

export const slugChecks = (slug: AnyPgColumn, name?: AnyPgColumn) => {
  const prefix = `${getTableName((slug as unknown as { table: PgTable }).table)}_${slug.name}`;
  return [
    check(`${prefix}_format`, sql`${slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check(`${prefix}_length`, sql`char_length(${slug}) between 1 and 100`),
    ...(name
      ? [
          check(
            `${prefix}_from_${name.name}`,
            sql`${slug} = regexp_replace(lower(btrim(${name})), '[[:space:]]+', '-', 'g')`,
          ),
        ]
      : []),
  ];
};
