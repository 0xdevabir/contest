import { keywordSetFor } from "./keywords";

/**
 * Single-pass regex tokenizer for Python — `#` line comments (no block
 * comments), triple-quoted and single-quoted strings. See c-like.ts for the
 * shared rationale (shallow regex tokenizer, not a real lexer).
 */
const TOKEN_RE =
  /#[^\n]*|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[A-Za-z_]\w*|\d+\.?\d*(?:[eE][+-]?\d+)?|\S/g;

export function tokenizePython(source: string): string[] {
  const keywords = keywordSetFor("python");
  const tokens: string[] = [];

  for (const match of source.matchAll(TOKEN_RE)) {
    const tok = match[0];
    if (tok.startsWith("#")) continue; // comment
    if (tok.startsWith('"') || tok.startsWith("'")) {
      tokens.push("S"); // string literal placeholder
      continue;
    }
    if (/^[A-Za-z_]/.test(tok)) {
      tokens.push(keywords.has(tok) ? tok : "V");
      continue;
    }
    tokens.push(tok); // number or punctuation, kept literal
  }
  return tokens;
}
