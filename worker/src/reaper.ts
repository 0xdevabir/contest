import { reapStalledSubmissions } from "@/lib/queue/reaper";
import { log } from "@/lib/log";

const REAP_INTERVAL_MS = 30_000;

export function startReaper(): () => void {
  const timer = setInterval(() => {
    reapStalledSubmissions()
      .then(({ requeued, failed }) => {
        if (requeued || failed) log.warn("reaper swept stalled submissions", { requeued, failed });
      })
      .catch((err) => log.error("reaper sweep failed", {}, err));
  }, REAP_INTERVAL_MS);
  return () => clearInterval(timer);
}
