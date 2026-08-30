import { randomUUID } from "crypto";

/**
 * A per-request id for correlating a client-visible failure with its server
 * log line. Cheap and dependency-free — AsyncLocalStorage is deliberately not
 * used here; routes that want correlation call `newRequestId()` once and pass
 * it explicitly to `log.*` calls, which keeps this module trivial to reason
 * about and safe under the Edge runtime if a route ever moves there.
 */
export function newRequestId(): string {
  return randomUUID();
}

/** Best-effort client IP for rate limiting. Never trust this for authz. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  // No reliable IP available (e.g. local dev without a proxy). Falling back to
  // a constant makes the rate-limit bucket effectively global for that
  // traffic rather than throwing — a safe failure mode, not a bypass.
  return "unknown";
}
