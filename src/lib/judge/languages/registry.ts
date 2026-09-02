import languagesData from "../../../../runner/languages.json";

/**
 * D1 — a language is data. This type (and runner/languages.json, its single
 * source of truth) is what makes adding Go a one-entry, one-Dockerfile,
 * one-golden-directory change — see docs/phases/PHASE-03-judge-engine.md.
 */
export type LanguageSpec = {
  /** Stable, used in submissions forever. */
  id: string;
  name: string;
  family: "c" | "cpp" | "python" | "java" | "js" | "go" | string;
  version: string;
  image: string;
  sourceFile: string;
  /** null = interpreted; no compile step. */
  compile: { argv: string[]; timeoutMs: number; outputFile: string } | null;
  run: { argv: string[] };
  /** Multipliers applied to the problem's declared limits. */
  timeFactor: number;
  memoryFactor: number;
  /** Extra memory headroom in MB before the cgroup cap (JVM, interpreter heap). */
  memoryOverheadMb: number;
  /** Family-specific stderr substring that means "out of memory" without an OOM kill (D3, JVM). */
  oomStderrPattern?: string;
  monacoLanguage: string;
  commentPrefix: string;
  enabled: boolean;
  order: number;
};

const REGISTRY: LanguageSpec[] = (languagesData.languages as LanguageSpec[])
  .slice()
  .sort((a, b) => a.order - b.order);

export function listLanguages(): LanguageSpec[] {
  return REGISTRY;
}

export function listEnabledLanguages(): LanguageSpec[] {
  return REGISTRY.filter((l) => l.enabled);
}

export class UnknownLanguageError extends Error {
  constructor(id: string) {
    super(`Unknown language: "${id}"`);
    this.name = "UnknownLanguageError";
  }
}

export class LanguageDisabledError extends Error {
  constructor(id: string) {
    super(`Language "${id}" is disabled`);
    this.name = "LanguageDisabledError";
  }
}

/** Throws for an unknown id. Callers that need to distinguish "disabled" use requireEnabledLanguage. */
export function getLanguage(id: string): LanguageSpec {
  const lang = REGISTRY.find((l) => l.id === id);
  if (!lang) throw new UnknownLanguageError(id);
  return lang;
}

export function findLanguage(id: string): LanguageSpec | undefined {
  return REGISTRY.find((l) => l.id === id);
}

/** Used at submission time: an unknown or disabled language must never reach the sandbox. */
export function requireEnabledLanguage(id: string): LanguageSpec {
  const lang = getLanguage(id);
  if (!lang.enabled) throw new LanguageDisabledError(id);
  return lang;
}

/** Problem limits scaled per-language — D1/D2/D3. */
export function scaledLimits(
  lang: LanguageSpec,
  problem: { timeLimitMs: number; memoryLimitMb: number }
): { cpuMs: number; wallMs: number; memoryMb: number } {
  const cpuMs = Math.round(problem.timeLimitMs * lang.timeFactor);
  const wallMs = Math.round(3 * cpuMs + 2000);
  const memoryMb = Math.round(problem.memoryLimitMb * lang.memoryFactor) + lang.memoryOverheadMb;
  return { cpuMs, wallMs, memoryMb };
}
