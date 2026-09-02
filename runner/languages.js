import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * Plain-JS mirror of src/lib/judge/languages/registry.ts, both reading the
 * same runner/languages.json (D1 — a language is data). The runner process
 * isn't part of the Next.js/TypeScript build, so it gets its own thin
 * loader rather than importing the .ts module directly.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(path.join(__dirname, "languages.json"), "utf8"));

const REGISTRY = [...data.languages].sort((a, b) => a.order - b.order);

export function getLanguage(id) {
  const lang = REGISTRY.find((l) => l.id === id);
  if (!lang) throw new Error(`Unknown language: "${id}"`);
  if (!lang.enabled) throw new Error(`Language "${id}" is disabled`);
  return lang;
}

export function listEnabledLanguages() {
  return REGISTRY.filter((l) => l.enabled);
}
