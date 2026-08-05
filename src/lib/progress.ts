const SOLVED_KEY = "diu-contesthub:solved";
const CODE_PREFIX = "diu-contesthub:code:";

const LEGACY_SOLVED_KEY = "contest-hub:solved";
const LEGACY_CODE_PREFIX = "contest-hub:code:";

function available() {
  return typeof window !== "undefined" && !!window.localStorage;
}

/** Moves pre-rebrand keys onto the current namespace. Safe to call repeatedly. */
function migrate() {
  if (!available()) return;
  try {
    const legacySolved = localStorage.getItem(LEGACY_SOLVED_KEY);
    if (legacySolved && !localStorage.getItem(SOLVED_KEY)) {
      localStorage.setItem(SOLVED_KEY, legacySolved);
    }
    if (legacySolved) localStorage.removeItem(LEGACY_SOLVED_KEY);

    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(LEGACY_CODE_PREFIX)) continue;
      const next = CODE_PREFIX + key.slice(LEGACY_CODE_PREFIX.length);
      const value = localStorage.getItem(key);
      if (value != null && !localStorage.getItem(next)) {
        localStorage.setItem(next, value);
      }
      localStorage.removeItem(key);
    }
  } catch {
    // storage disabled or full — progress simply stays where it is
  }
}

export function loadSolved(): Set<string> {
  if (!available()) return new Set();
  migrate();
  try {
    const raw = localStorage.getItem(SOLVED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markSolved(id: string) {
  if (!available()) return;
  const set = loadSolved();
  set.add(id);
  try {
    localStorage.setItem(SOLVED_KEY, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

export function loadDraft(problemId: string): string | null {
  if (!available()) return null;
  migrate();
  try {
    return localStorage.getItem(CODE_PREFIX + problemId);
  } catch {
    return null;
  }
}

export function saveDraft(problemId: string, code: string) {
  if (!available()) return;
  try {
    localStorage.setItem(CODE_PREFIX + problemId, code);
  } catch {
    // ignore
  }
}

export function clearDraft(problemId: string) {
  if (!available()) return;
  try {
    localStorage.removeItem(CODE_PREFIX + problemId);
  } catch {
    // ignore
  }
}
