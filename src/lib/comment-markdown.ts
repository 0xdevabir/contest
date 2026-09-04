import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

/**
 * Community-authored Markdown (D2) — a narrower allowlist than
 * src/lib/statement.ts's (no math, no images: comments aren't statements).
 * `rehype-highlight` runs before sanitising so its `className`s on
 * `code`/`span` survive the same way statement.ts allowlists KaTeX's.
 */
const schema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter((t) => t !== "img"),
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), "className"],
    span: [...(defaultSchema.attributes?.span ?? []), "className"],
    a: [...(defaultSchema.attributes?.a ?? []), "href", "title"],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto"],
  },
};

/** No caching — unlike a published problem statement, a comment can be
 * edited within its 15-minute window, so stale HTML would be wrong. */
export async function renderComment(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeHighlight)
    .use(rehypeSanitize, schema)
    .use(rehypeStringify)
    .process(markdown);

  return String(file);
}
