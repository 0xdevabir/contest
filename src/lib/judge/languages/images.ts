import { readFileSync } from "fs";
import path from "path";
import { log } from "../../log";
import type { LanguageSpec } from "./registry";

/**
 * D-images — image provenance. `runner/build-images.sh` builds every
 * language image in CI, tags it by date, and writes the resolved digest here
 * so workers refuse to start on a mismatch instead of silently running a
 * `latest` that drifted from what was security-reviewed.
 */
export type ImageLock = {
  [languageId: string]: { image: string; digest: string; builtAt: string };
};

let cached: ImageLock | null = null;

function lockPath(): string {
  return path.join(process.cwd(), "runner", "images.lock.json");
}

function loadLock(): ImageLock {
  if (cached) return cached;
  try {
    const raw = readFileSync(lockPath(), "utf8");
    cached = JSON.parse(raw) as ImageLock;
  } catch (err) {
    log.warn("images.lock.json not found or unreadable — falling back to registry image names without digest pinning", {
      error: err instanceof Error ? err.message : String(err),
    });
    cached = {};
  }
  return cached;
}

/**
 * Resolves the exact image reference to run a submission's sandbox against.
 * Prefers the digest-pinned entry from CI; falls back to the registry's bare
 * image name (dev, or before the lock file has been generated for a
 * language) so local development is never blocked on a CI artifact.
 */
export function resolveImage(lang: LanguageSpec): { image: string; digestPinned: boolean } {
  const lock = loadLock();
  const entry = lock[lang.id];
  if (entry?.digest) {
    return { image: `${entry.image}@${entry.digest}`, digestPinned: true };
  }
  return { image: lang.image, digestPinned: false };
}

/** Test-only: clears the in-process lock-file cache. */
export function _clearImageLockCacheForTests(): void {
  cached = null;
}
