import { getLanguage } from "../../judge/languages/registry";
import { tokenizeCLike } from "./c-like";
import { tokenizePython } from "./python";

/**
 * Normalizes a submission's source into a structure-only token stream:
 * comments and string/char literals stripped or placeholder'd, non-keyword
 * identifiers renamed to `V`, whitespace collapsed away entirely (the token
 * array itself carries no whitespace). Renaming variables, reformatting, and
 * adding comments all collapse to the identical token stream — that's the
 * whole point (docs/phases/PHASE-10-integrity.md D1).
 */
export function normalizeSource(source: string, languageId: string): string[] {
  const lang = getLanguage(languageId);
  if (lang.family === "python") return tokenizePython(source);
  return tokenizeCLike(source, lang.family);
}
