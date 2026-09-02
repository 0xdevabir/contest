import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

/**
 * Teacher-authored Markdown reaches every student in a section — the
 * allowlist is deliberately explicit rather than "defaultSchema minus a
 * blocklist" (D5). Extends the standard schema only with what KaTeX's own
 * output needs (math/annotation tags, className/style on spans for glyph
 * positioning) and with the tags a statement legitimately uses (tables,
 * images for figures).
 */
const schema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "math",
    "semantics",
    "mrow",
    "mi",
    "mn",
    "mo",
    "msup",
    "msub",
    "msubsup",
    "mfrac",
    "msqrt",
    "mroot",
    "mtable",
    "mtr",
    "mtd",
    "mtext",
    "annotation",
    "annotation-xml",
  ],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className", "style"],
    span: [...(defaultSchema.attributes?.span ?? []), "className", "style", "aria-hidden"],
    img: [...(defaultSchema.attributes?.img ?? []), "src", "alt", "title", "width", "height"],
    math: ["xmlns", "display"],
    annotation: ["encoding"],
  },
  protocols: {
    ...defaultSchema.protocols,
    src: ["http", "https", "data"],
  },
};

const cache = new Map<string, string>();
const CACHE_MAX = 500;

/**
 * Markdown + `$...$` / `$$...$$` math -> sanitised HTML, rendered server-side
 * (D5: statement is the most-viewed content on the site and must be in the
 * RSC payload for SEO/slow devices, not client-rendered). Cached by
 * `problemVersionId` — a version is immutable once published, so the cache
 * never needs invalidation for a published version; draft edits pass a
 * fresh id-less cache key (see `renderDraftStatement`) so edits are always
 * live.
 */
export async function renderStatement(markdown: string, cacheKey?: string): Promise<string> {
  if (cacheKey) {
    const hit = cache.get(cacheKey);
    if (hit !== undefined) return hit;
  }

  const file = await unified()
    .use(remarkParse)
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeKatex, { throwOnError: false, strict: false })
    .use(rehypeSanitize, schema)
    .use(rehypeStringify)
    .process(markdown);

  const html = String(file);

  if (cacheKey) {
    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(cacheKey, html);
  }

  return html;
}

/** Draft content changes on every keystroke — never cached. */
export async function renderDraftStatement(markdown: string): Promise<string> {
  return renderStatement(markdown);
}

/** Test-only: clears the in-process render cache. */
export function _clearStatementCacheForTests(): void {
  cache.clear();
}
