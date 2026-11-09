# Rendering Remote MDX in Next.js: Performance and Caching Notes

Notes on using `next-mdx-remote` (RSC) in the App Router, how it affects performance, and how to cache it with `'use cache'`.

## Performance impact

`next-mdx-remote/rsc` compiles and evaluates MDX **on the server at render time**. This differs from `@next/mdx`, which compiles at build time. Without caching, every uncached request repeats parsing and compilation.

- **Cost is server CPU.** It grows with document size and the number of remark/rehype plugins. For short content it is usually negligible; for long documents or high traffic it becomes noticeable. Measure on your own content and hardware.
- **No client-side cost.** The output is RSC, so the MDX compiler is not shipped to the browser.

## Caching with `use cache`

`'use cache'` is a Cache Components feature. Enable it first:

```ts
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
};

export default nextConfig;
```

Best pattern: put the **whole component** (fetching the source and compiling it) inside one cached function, and pass only simple values such as a `slug` as arguments.

```tsx
// components/RemoteMdx.tsx
import { MDXRemote } from 'next-mdx-remote/rsc';
import { cacheLife, cacheTag } from 'next/cache';
import { Callout } from './Callout';

const components = { Callout };

export async function RemoteMdx({ slug }: { slug: string }) {
  'use cache';
  cacheLife('hours');
  cacheTag(`mdx:${slug}`);

  const res = await fetch(`https://example.com/docs/${slug}.mdx`);
  if (!res.ok) throw new Error(`MDX not found: ${slug}`);

  return <MDXRemote source={await res.text()} components={components} />;
}
```

```tsx
// app/guides/[slug]/page.tsx
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <main>
      <h1>Guide</h1>
      <RemoteMdx slug={slug} />
      <ContactForm />
    </main>
  );
}
```

### Invalidation

When the source changes, invalidate by tag with `revalidateTag('mdx:<slug>', 'max')`, or use `updateTag`, from a Server Action or Route Handler.

## Important notes

- **Arguments must be serializable**, and the cache key is built from them. Do not pass `components` as a prop to the cached function, since it contains functions or components. Define it in the same module, as shown above.
- **Do not pass large text as an argument.** It becomes part of the cache key. Pass a `slug` and fetch the source inside the cached function.
- **The in-memory cache is per server instance.** It is not shared across instances and does not survive restarts. For shared or persistent caching, look at `'use cache: remote'`.
- **Pre-render known pages.** Return the known slugs from `generateStaticParams` so pages are built ahead of time and the first visitor does not pay the compile cost.

## Choosing an approach

| Situation                                          | Recommendation                                                   |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| Static files inside the repo (guides, legal pages) | `@next/mdx`: compiled at build time, no runtime cost             |
| External source or database content                | `next-mdx-remote` plus `'use cache'`                             |
| Untrusted or admin-written content                 | Markdoc or `react-markdown`, which do not execute arbitrary code |

## Security

MDX can execute code. For external or admin-authored content, read the README of the exact version you install for options that restrict expressions or JavaScript, and only expose an allow-listed set of components through `components`. If the source is not fully trusted, prefer Markdoc (only registered tags) or `react-markdown` (plain Markdown, no raw HTML by default).

## Related notes

- For plain Markdown without embedded components, `react-markdown` in a Server Component is enough, optionally with `remark-gfm` for tables and task lists.
- Markdoc's core package (`@markdoc/markdoc`) works standalone with `parse`, `transform` and `renderers.react`. The `@markdoc/next.js` plugin targets the Pages Router and is not needed for this use case.
