import { z } from 'zod';

type Merge<A, B> = {
  [P in keyof A | keyof B]: P extends keyof B
    ? B[P]
    : P extends keyof A
      ? A[P]
      : never;
};

export function discriminatedVariants<
  B extends z.ZodObject<z.ZodRawShape>,
  const K extends string,
  E extends z.ZodEnum<any>,
  D extends z.ZodRawShape = {},
>(base: B, key: K, discriminator: E, defaults?: D) {
  type V = z.output<E> & string;

  type AnyVariant = z.ZodObject<{ [P in K]: z.ZodLiteral<V> } & z.ZodRawShape>;

  type CoveredOf<T extends readonly AnyVariant[]> = T[number] extends infer U
    ? U extends z.ZodObject<infer Sh>
      ? Sh extends { [P in K]: z.ZodLiteral<infer L> }
        ? L
        : never
      : never
    : never;

  type Exhaustive<T extends readonly AnyVariant[]> = [
    Exclude<V, CoveredOf<T>>,
  ] extends [never]
    ? unknown
    : { __missingVariants: Exclude<V, CoveredOf<T>> };

  const variant = <
    const R extends V,
    S extends z.ZodRawShape & { [P in K]?: never }, // override کلید تمایز ممنوع
  >(
    value: R,
    shape: S,
  ): z.ZodObject<
    Merge<Merge<B['shape'], D>, S & { [P in K]: z.ZodLiteral<R> }>
  > => base.extend({ ...defaults, ...shape, [key]: z.literal(value) }) as never;

  const build = <const T extends readonly [AnyVariant, ...AnyVariant[]]>(
    variants: T & Exhaustive<T>,
  ): z.ZodDiscriminatedUnion<T, K> => {
    const seen = new Set<string>();
    for (const v of variants) {
      const value = v.shape[key].value as string;
      if (seen.has(value)) {
        throw new Error(`Duplicate "${key}" variant: ${value}`);
      }
      seen.add(value);
    }

    const missing = (discriminator.options as string[]).filter(
      (o) => !seen.has(o),
    );
    if (missing.length) {
      throw new Error(`Missing "${key}" variants: ${missing.join(', ')}`);
    }

    return z.discriminatedUnion(key, variants as never) as never;
  };

  return { variant, build };
}
