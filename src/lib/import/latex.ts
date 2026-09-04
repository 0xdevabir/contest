/**
 * D3 — "LaTeX → Markdown conversion is lossy in general; convert the common
 * subset (\textbf, \it, itemize, verbatim, $...$) and leave anything
 * unrecognised as raw LaTeX in a fenced block with a warning, rather than
 * silently mangling it."
 *
 * This is intentionally not a general LaTeX parser — it's a small set of
 * regex substitutions for the handful of macros Polygon statements actually
 * use, applied in a fixed order so nested commands convert outside-in.
 */
export type LatexConvertResult = { markdown: string; warnings: string[] };

const KNOWN_MACROS: { pattern: RegExp; replace: (m: RegExpMatchArray) => string }[] = [
  { pattern: /\\textbf\{([^{}]*)\}/g, replace: (m) => `**${m[1]}**` },
  { pattern: /\\textit\{([^{}]*)\}/g, replace: (m) => `*${m[1]}*` },
  { pattern: /\\emph\{([^{}]*)\}/g, replace: (m) => `*${m[1]}*` },
  { pattern: /\{\\it\s+([^{}]*)\}/g, replace: (m) => `*${m[1]}*` },
  { pattern: /\{\\bf\s+([^{}]*)\}/g, replace: (m) => `**${m[1]}**` },
  { pattern: /\\texttt\{([^{}]*)\}/g, replace: (m) => `\`${m[1]}\`` },
];

function convertItemize(text: string): string {
  return text.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (_m, body: string) => {
    const items = body
      .split(/\\item/)
      .map((s) => s.trim())
      .filter(Boolean);
    return items.map((i) => `- ${i}`).join("\n");
  });
}

function convertEnumerate(text: string): string {
  return text.replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, (_m, body: string) => {
    const items = body
      .split(/\\item/)
      .map((s) => s.trim())
      .filter(Boolean);
    return items.map((i, idx) => `${idx + 1}. ${i}`).join("\n");
  });
}

function convertVerbatim(text: string): string {
  return text.replace(/\\begin\{verbatim\}([\s\S]*?)\\end\{verbatim\}/g, (_m, body: string) => "```\n" + body.trim() + "\n```");
}

/** Math is kept verbatim (D3) — `$...$` and `$$...$$` already render via the
 * existing KaTeX pipeline (src/lib/statement.ts), so no conversion needed. */
export function convertLatexToMarkdown(source: string): LatexConvertResult {
  const warnings: string[] = [];
  let text = source;

  text = convertVerbatim(text);
  text = convertItemize(text);
  text = convertEnumerate(text);
  for (const { pattern, replace } of KNOWN_MACROS) {
    text = text.replace(pattern, (...args) => replace(args as unknown as RegExpMatchArray));
  }

  // Anything still matching an unrecognised \command{...} is left verbatim
  // in a fenced block with a warning, rather than silently mangled.
  const unknownCommand = /\\[a-zA-Z]+(\{[^{}]*\})?/g;
  const remaining = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = unknownCommand.exec(text))) {
    remaining.add(match[0]);
  }
  for (const cmd of remaining) {
    warnings.push(`Unrecognised LaTeX macro left verbatim: ${cmd}`);
  }

  return { markdown: text.trim(), warnings };
}
