import { keywordSetFor } from "./keywords";

/**
 * Single-pass regex tokenizer for c/cpp/java/js — near-identical comment
 * (`//`, block comments) and string (`"..."`, `'...'`) syntax. Not a real
 * lexer: this is intentionally shallow (SOLUTION EFFICIENCY ladder) because
 * the winnowing fingerprint only needs *structure*, not a compiler
 * front-end — comments/strings collapse to nothing/one placeholder,
 * identifiers that aren't reserved words collapse to `V`, everything else
 * (keywords, numbers, punctuation) passes through unchanged.
 */
const TOKEN_RE =
  /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[A-Za-z_]\w*|\d+\.?\d*(?:[eE][+-]?\d+)?|\S/g;

export function tokenizeCLike(source: string, family: string): string[] {
  const keywords = keywordSetFor(family);
  const tokens: string[] = [];

  for (const match of source.matchAll(TOKEN_RE)) {
    const tok = match[0];
    if (tok.startsWith("//") || tok.startsWith("/*")) continue; // comment
    if (tok.startsWith('"') || tok.startsWith("'")) {
      tokens.push("S"); // string/char literal placeholder
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
