import { getQueueStats } from "./queue-stats";
import { getRedis } from "./redis";
import { isEnabled } from "./flags";
import { log } from "./log";

/**
 * Phase 13 Part 4 — queue-depth autoscaling for `worker/`'s judge hosts.
 *
 * No Hetzner project exists in this environment (no `HETZNER_API_TOKEN`), so
 * the whole controller must be safe to run with zero credentials: it still
 * computes and logs a decision every tick (useful signal on its own), but the
 * actual Hetzner Cloud API call (`applyHetznerScaling`) early-returns with a
 * logged no-op the moment the token is missing. Gated on the `scaleOps` flag
 * on top of that.
 *
 * Sustained-window and cooldown state is kept in Redis (`autoscale:state`) so
 * it survives a worker-process restart; if Redis is down, an in-process
 * fallback keeps the controller working for the life of that process instead
 * of crashing the tick — losing the sustained window on a Redis outage is
 * acceptable (it just delays a scale action by up to the sustain window), a
 * crash is not.
 */

const SUSTAIN_UP_MS = 60_000; // depth > 2x capacity for this long -> scale up
const SUSTAIN_DOWN_MS = 10 * 60_000; // depth < 0.5x capacity for this long -> scale down
const COOLDOWN_MS = 5 * 60_000; // minimum gap between two scale actions
const DEFAULT_MAX_INSTANCES = 5;
const MIN_INSTANCES = 1;

const STATE_KEY = "autoscale:state";
const STATE_TTL_SEC = 60 * 60;

type ControllerState = {
  aboveSince: number | null;
  belowSince: number | null;
  lastActionAt: number | null;
};

const EMPTY_STATE: ControllerState = { aboveSince: null, belowSince: null, lastActionAt: null };

/** Module-level fallback used only when Redis is unreachable. Scoped to this
 * process, so a restart loses it — same failure mode as losing Redis itself. */
let memoryState: ControllerState = { ...EMPTY_STATE };

async function readState(): Promise<ControllerState> {
  const redis = getRedis();
  if (!redis) return memoryState;
  try {
    const raw = await redis.get(STATE_KEY);
    if (!raw) return { ...EMPTY_STATE };
    return { ...EMPTY_STATE, ...(JSON.parse(raw) as Partial<ControllerState>) };
  } catch (err) {
    log.warn("autoscale state read failed, falling back to in-memory state", {
      error: err instanceof Error ? err.message : String(err),
    });
    return memoryState;
  }
}

async function writeState(state: ControllerState): Promise<void> {
  memoryState = state;
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(STATE_KEY, JSON.stringify(state), "EX", STATE_TTL_SEC);
  } catch (err) {
    log.warn("autoscale state write failed, kept in-memory only", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export type AutoscaleDecision = {
  action: "none" | "scale_up" | "scale_down";
  reason: string;
  depth: number;
  capacity: number;
  instances: number;
  maxInstances: number;
  targetInstances: number;
};

function maxInstances(): number {
  const raw = Number(process.env.HETZNER_MAX_WORKERS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_INSTANCES;
}

/**
 * Reads queue depth via `getQueueStats()`, applies the sustained-window +
 * cooldown state machine, and returns what should happen next — never throws,
 * never talks to Hetzner itself (see `applyHetznerScaling`).
 */
export async function decideAutoscale(): Promise<AutoscaleDecision> {
  const enabled = await isEnabled("scaleOps");
  if (!enabled) {
    return { action: "none", reason: "scaleOps flag disabled", depth: 0, capacity: 0, instances: 0, maxInstances: maxInstances(), targetInstances: 0 };
  }

  const stats = await getQueueStats();
  const depth = stats.depthByPriority.reduce((sum, d) => sum + d.count, 0);
  const capacity = stats.workers.reduce((sum, w) => sum + w.concurrency, 0);
  const instances = stats.workers.length;
  const max = maxInstances();
  const now = Date.now();

  const state = await readState();
  const cooling = state.lastActionAt !== null && now - state.lastActionAt < COOLDOWN_MS;

  const upThreshold = capacity * 2;
  const downThreshold = capacity * 0.5;

  const base = { depth, capacity, instances, maxInstances: max };

  if (depth > upThreshold) {
    const aboveSince = state.aboveSince ?? now;
    const sustainedMs = now - aboveSince;
    await writeState({ ...state, aboveSince, belowSince: null });

    if (sustainedMs >= SUSTAIN_UP_MS && !cooling && instances < max) {
      const targetInstances = Math.min(max, instances + 1);
      await writeState({ aboveSince: null, belowSince: null, lastActionAt: now });
      return {
        ...base,
        action: "scale_up",
        targetInstances,
        reason: `depth ${depth} > 2x capacity (${capacity}) sustained ${Math.round(sustainedMs / 1000)}s`,
      };
    }
    return {
      ...base,
      action: "none",
      targetInstances: instances,
      reason: cooling
        ? "above threshold but within cooldown"
        : instances >= max
          ? "above threshold but already at max instances"
          : `above threshold, waiting for ${SUSTAIN_UP_MS / 1000}s sustain window`,
    };
  }

  if (depth < downThreshold && capacity > 0) {
    const belowSince = state.belowSince ?? now;
    const sustainedMs = now - belowSince;
    await writeState({ ...state, belowSince, aboveSince: null });

    if (sustainedMs >= SUSTAIN_DOWN_MS && !cooling && instances > MIN_INSTANCES) {
      const targetInstances = Math.max(MIN_INSTANCES, instances - 1);
      await writeState({ aboveSince: null, belowSince: null, lastActionAt: now });
      return {
        ...base,
        action: "scale_down",
        targetInstances,
        reason: `depth ${depth} < 0.5x capacity (${capacity}) sustained ${Math.round(sustainedMs / 1000)}s`,
      };
    }
    return {
      ...base,
      action: "none",
      targetInstances: instances,
      reason: cooling
        ? "below threshold but within cooldown"
        : instances <= MIN_INSTANCES
          ? "below threshold but already at minimum instances"
          : `below threshold, waiting for ${SUSTAIN_DOWN_MS / 1000}s sustain window`,
    };
  }

  await writeState({ ...state, aboveSince: null, belowSince: null });
  return { ...base, action: "none", targetInstances: instances, reason: "within band" };
}

const HETZNER_API_BASE = "https://api.hetzner.cloud/v1";

function hetznerHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/**
 * The only function in this module that talks to Hetzner. Early-returns with
 * a logged no-op whenever `HETZNER_API_TOKEN` is unset — this MUST be safe to
 * call with no credentials configured, since none exist in this environment.
 */
export async function applyHetznerScaling(decision: AutoscaleDecision): Promise<void> {
  if (decision.action === "none") return;

  const token = process.env.HETZNER_API_TOKEN;
  if (!token) {
    log.info("autoscale decision computed, no-op (HETZNER_API_TOKEN unset)", { decision });
    return;
  }

  try {
    if (decision.action === "scale_up") {
      const res = await fetch(`${HETZNER_API_BASE}/servers`, {
        method: "POST",
        headers: hetznerHeaders(token),
        body: JSON.stringify({
          name: `judge-worker-${Date.now()}`,
          server_type: process.env.HETZNER_SERVER_TYPE || "cx22",
          image: process.env.HETZNER_IMAGE || "docker-ce",
          location: process.env.HETZNER_LOCATION || "fsn1",
          labels: { role: "judge-worker" },
        }),
      });
      if (!res.ok) {
        log.error("hetzner scale-up request failed", { status: res.status, body: await res.text().catch(() => "") });
        return;
      }
      log.info("hetzner scale-up requested", { targetInstances: decision.targetInstances });
      return;
    }

    // scale_down: find the most recently created judge-worker server and remove it.
    // No server-id bookkeeping exists elsewhere in this repo, so this relies on the
    // `role=judge-worker` label set on create above rather than a tracked instance list.
    const listRes = await fetch(`${HETZNER_API_BASE}/servers?label_selector=role%3Djudge-worker&sort=created:desc`, {
      headers: hetznerHeaders(token),
    });
    if (!listRes.ok) {
      log.error("hetzner scale-down list request failed", { status: listRes.status });
      return;
    }
    const data = (await listRes.json()) as { servers?: Array<{ id: number; name: string }> };
    const server = data.servers?.[0];
    if (!server) {
      log.warn("hetzner scale-down: no judge-worker servers found to remove", {});
      return;
    }
    const delRes = await fetch(`${HETZNER_API_BASE}/servers/${server.id}`, {
      method: "DELETE",
      headers: hetznerHeaders(token),
    });
    if (!delRes.ok) {
      log.error("hetzner scale-down delete request failed", { status: delRes.status, serverId: server.id });
      return;
    }
    log.info("hetzner scale-down completed", { serverId: server.id, name: server.name });
  } catch (err) {
    log.error("hetzner API call failed", { decision }, err);
  }
}

/**
 * "Ensure N workers" entry point for the contest pre-warm heuristic
 * (`src/lib/contest-lifecycle.ts`). Best-effort and idempotent: if the fleet
 * is already at or above `minInstances` this is a no-op decision, so calling
 * it repeatedly across a 15-minute pre-warm window is safe.
 */
export async function ensureWorkerCapacity(minInstances: number, reason: string): Promise<void> {
  const enabled = await isEnabled("scaleOps");
  if (!enabled) {
    log.info("pre-warm ensure-capacity skipped (scaleOps flag disabled)", { minInstances, reason });
    return;
  }

  const stats = await getQueueStats();
  const instances = stats.workers.length;
  const max = maxInstances();

  if (instances >= minInstances) {
    log.info("pre-warm ensure-capacity: already sufficient", { minInstances, instances, reason });
    return;
  }

  const targetInstances = Math.min(max, minInstances);
  const decision: AutoscaleDecision = {
    action: "scale_up",
    reason,
    depth: 0,
    capacity: stats.workers.reduce((sum, w) => sum + w.concurrency, 0),
    instances,
    maxInstances: max,
    targetInstances,
  };
  log.info("pre-warm ensure-capacity: requesting scale-up", decision);
  await applyHetznerScaling(decision);
}
