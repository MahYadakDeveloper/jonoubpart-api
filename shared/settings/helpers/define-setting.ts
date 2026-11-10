import { z } from 'zod';

const SETTING_KEY = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export interface SettingDefinition<S extends z.ZodType> {
  /** Unique kebab-case key, e.g. 'order-settings' */
  readonly key: string;
  readonly schema: S;
  /** Already validated and parsed by `schema` */
  readonly defaultValue: z.output<S>;
}

export type SettingValue<T extends { schema: z.ZodType }> = z.infer<
  T['schema']
>;

export function defineSetting<S extends z.ZodType>(def: {
  key: string;
  schema: S;
  defaultValue: z.input<S>;
}): SettingDefinition<S> {
  if (!SETTING_KEY.test(def.key)) {
    throw new Error(
      `Invalid setting key "${def.key}": must be kebab-case (e.g. "order-settings")`,
    );
  }

  const parsed = def.schema.safeParse(def.defaultValue);
  if (!parsed.success) {
    throw new Error(
      `Invalid defaultValue for setting "${def.key}": ${z.prettifyError(parsed.error)}`,
    );
  }

  return Object.freeze({
    key: def.key,
    schema: def.schema,
    defaultValue: parsed.data,
  });
}
