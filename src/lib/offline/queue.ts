import { SUBMISSIONS_STORE, idbDelete, idbGetAll, idbPut } from "./db";

export type QueuedSubmission = {
  /** Doubles as the idempotency key sent to POST /api/judge — see D4/D2 risk table. */
  id: string;
  problemId: string;
  code: string;
  stdin?: string;
  contestId?: string;
  assignmentId?: string;
  createdAt: number;
  status: "queued" | "sending" | "error";
  error?: string;
};

const CHANGED_EVENT = "diu:offline-queue-changed";
const SENT_EVENT = "diu:offline-submission-sent";

function notifyChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED_EVENT));
}

/** Subscribe to any queue mutation (enqueue, sent, error) — for badge counts. */
export function onQueueChanged(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGED_EVENT, cb);
  return () => window.removeEventListener(CHANGED_EVENT, cb);
}

/** Fires once per submission that actually reaches the server — ProblemWorkspace
 * uses this to finish the "queued -> sent" UI transition for a background flush. */
export function onSubmissionSent(
  cb: (detail: { id: string; submissionId?: string; verdict?: string }) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => cb((e as CustomEvent).detail);
  window.addEventListener(SENT_EVENT, handler);
  return () => window.removeEventListener(SENT_EVENT, handler);
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `off_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export async function enqueueSubmission(input: {
  problemId: string;
  code: string;
  stdin?: string;
  contestId?: string;
  assignmentId?: string;
}): Promise<QueuedSubmission> {
  const item: QueuedSubmission = { ...input, id: newId(), createdAt: Date.now(), status: "queued" };
  await idbPut(SUBMISSIONS_STORE, item);
  notifyChanged();
  return item;
}

export async function listQueued(): Promise<QueuedSubmission[]> {
  const all = await idbGetAll<QueuedSubmission>(SUBMISSIONS_STORE);
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

let flushing = false;

/**
 * Sends every queued submission in order, oldest first. Stops (rather than
 * skipping ahead) on the first network failure — a still-offline student
 * should not have submissions land out of order once they do reconnect.
 * `clientRequestId` makes a retried flush safe: the server dedupes on
 * `(userId, clientRequestId)` (see PHASE-14 D4's offline risk row).
 */
export async function flushQueue(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  flushing = true;
  try {
    const items = await listQueued();
    for (const item of items) {
      let res: Response;
      try {
        res = await fetch("/api/judge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            problemId: item.problemId,
            code: item.code,
            mode: "submit",
            stdin: item.stdin,
            contestId: item.contestId,
            assignmentId: item.assignmentId,
            clientRequestId: item.id,
          }),
        });
      } catch {
        // Still offline (or the connection dropped mid-flush) — leave the
        // rest of the queue intact and try again on the next "online" event.
        break;
      }

      if (res.status >= 500 || res.status === 429) {
        // Transient — keep it queued, stop this pass.
        break;
      }
      if (!res.ok) {
        // Not retryable (validation, contest closed, etc.) — surface it and
        // move on so one bad item doesn't block the rest of the queue.
        await idbPut(SUBMISSIONS_STORE, { ...item, status: "error", error: `HTTP ${res.status}` });
        notifyChanged();
        continue;
      }

      const data = (await res.json().catch(() => null)) as
        | { submissionId?: string; verdict?: string }
        | null;
      await idbDelete(SUBMISSIONS_STORE, item.id);
      notifyChanged();
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(SENT_EVENT, {
            detail: { id: item.id, submissionId: data?.submissionId, verdict: data?.verdict },
          })
        );
      }
    }
  } finally {
    flushing = false;
  }
}

export async function removeFromQueue(id: string): Promise<void> {
  await idbDelete(SUBMISSIONS_STORE, id);
  notifyChanged();
}
