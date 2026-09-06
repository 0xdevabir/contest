const SOLVED_KEY = "codehub:solved";
const CODE_PREFIX = "codehub:code:";

/** Pre-rebrand namespaces — migrate once onto `codehub:*`. */
const LEGACY_SOLVED_KEYS = ["diu-contesthub:solved", "contest-hub:solved"] as const;
const LEGACY_CODE_PREFIXES = ["diu-contesthub:code:", "contest-hub:code:"] as const;

function available() {
  return typeof window !== "undefined" && !!window.localStorage;
}

/** Moves pre-rebrand keys onto the current namespace. Safe to call repeatedly. */
function migrate() {
  if (!available()) return;
  try {
    for (const legacy of LEGACY_SOLVED_KEYS) {
      const legacySolved = localStorage.getItem(legacy);
      if (legacySolved && !localStorage.getItem(SOLVED_KEY)) {
        localStorage.setItem(SOLVED_KEY, legacySolved);
      }
      if (legacySolved) localStorage.removeItem(legacy);
    }

    for (const key of Object.keys(localStorage)) {
      for (const legacyPrefix of LEGACY_CODE_PREFIXES) {
        if (!key.startsWith(legacyPrefix)) continue;
        const next = CODE_PREFIX + key.slice(legacyPrefix.length);
        const value = localStorage.getItem(key);
        if (value != null && !localStorage.getItem(next)) {
          localStorage.setItem(next, value);
        }
        localStorage.removeItem(key);
      }
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
