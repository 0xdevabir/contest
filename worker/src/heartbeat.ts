import { touchHeartbeat } from "@/lib/submission-state";

const HEARTBEAT_INTERVAL_MS = 20_000;

/** Starts a periodic heartbeat touch for a claimed submission; call the returned fn to stop it. */
export function startHeartbeat(submissionId: string, workerId: string): () => void {
  const timer = setInterval(() => {
    void touchHeartbeat(submissionId, workerId);
  }, HEARTBEAT_INTERVAL_MS);
  return () => clearInterval(timer);
}
