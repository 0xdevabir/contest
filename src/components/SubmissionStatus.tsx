"use client";

import { useEffect, useRef, useState } from "react";
import type { JudgeResponse, JudgeVerdict } from "@/lib/types";

const POLL_INTERVAL_MS = 1000;
const MAX_SSE_FAILURES = 2;

export type SubmissionProgress = {
  state: "QUEUED" | "JUDGING" | "DONE" | "FAILED";
  progress?: { group: number; test: number; of: number; verdict: string };
  result?: JudgeResponse | null;
};

/**
 * Tracks a queued submission from the 202 response through to a verdict
 * (D4). Prefers SSE (/api/submissions/[id]/stream); after
 * `MAX_SSE_FAILURES` failed connection attempts it falls back to 1s polling
 * of GET /api/submissions/[id] — the same terminal shape either way, so
 * ProblemWorkspace doesn't need to know which transport is active.
 */
export function useSubmissionStatus(submissionId: string | null): SubmissionProgress {
  const [status, setStatus] = useState<SubmissionProgress>({ state: "QUEUED" });
  const failuresRef = useRef(0);
  const pollingRef = useRef(false);

  useEffect(() => {
    if (!submissionId) {
      setStatus({ state: "QUEUED" });
      return;
    }

    setStatus({ state: "QUEUED" });
    failuresRef.current = 0;
    pollingRef.current = false;

    let stopped = false;
    let es: EventSource | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    function toJudgeResponse(data: {
      verdict: string;
      score?: number;
      maxScore?: number;
    }): JudgeResponse {
      return { ok: true, verdict: data.verdict as JudgeVerdict, results: [], score: data.score, maxScore: data.maxScore };
    }

    async function poll() {
      if (stopped) return;
      pollingRef.current = true;
      try {
        const res = await fetch(`/api/submissions/${submissionId}`);
        const data = await res.json();
        if (stopped) return;
        if (data.ok) {
          setStatus({
            state: data.state,
            result:
              data.state === "DONE" || data.state === "FAILED"
                ? { ok: true, verdict: data.verdict, results: data.report?.results ?? [], score: data.score, maxScore: data.maxScore }
                : null,
          });
          if (data.state === "DONE" || data.state === "FAILED") return;
        }
      } catch {
        // transient — keep polling
      }
      pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
    }

    function startPolling() {
      if (pollingRef.current) return;
      es?.close();
      void poll();
    }

    try {
      es = new EventSource(`/api/submissions/${submissionId}/stream`);
      es.addEventListener("state", (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        setStatus((prev) => ({ ...prev, state: data.state }));
      });
      es.addEventListener("progress", (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        setStatus((prev) => ({ ...prev, progress: data }));
      });
      es.addEventListener("result", (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        setStatus({ state: "DONE", result: toJudgeResponse(data) });
        es?.close();
      });
      es.onerror = () => {
        failuresRef.current += 1;
        if (failuresRef.current >= MAX_SSE_FAILURES) {
          startPolling();
        }
      };
    } catch {
      startPolling();
    }

    return () => {
      stopped = true;
      es?.close();
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [submissionId]);

  return status;
}
