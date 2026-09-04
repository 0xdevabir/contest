"use client";

import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";

type Solution = {
  id: string;
  userId: string;
  authorName: string;
  language: string;
  note: string;
  score: number;
  code: string;
  createdAt: string;
};

export function SolutionsList({ problemId }: { problemId: string }) {
  const [state, setState] = useState<"loading" | "gated" | "ready">("loading");
  const [reason, setReason] = useState<string | null>(null);
  const [solutions, setSolutions] = useState<Solution[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setState("loading");
    fetch(`/api/problems/${problemId}/solutions`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setReason(data.message ?? "Not available.");
          setState("gated");
          return;
        }
        setSolutions(data.solutions ?? []);
        setState("ready");
      })
      .catch(() => setState("gated"));
  }, [problemId]);

  if (state === "loading") return <p className="text-xs text-[var(--muted)]">Loading…</p>;

  if (state === "gated") {
    return (
      <div className="rounded-xl border border-[var(--warn)]/30 bg-[var(--warn-surface)] p-5 text-center">
        <TriangleAlert className="mx-auto text-[var(--warn)]" size={22} aria-hidden />
        <p className="mt-2 text-sm text-[var(--warn)]">{reason}</p>
      </div>
    );
  }

  if (solutions.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No one has shared a solution for this problem yet.</p>;
  }

  return (
    <div className="space-y-2">
      {solutions.map((s) => (
        <div key={s.id} className="panel overflow-hidden">
          <button
            type="button"
            onClick={() => setExpanded(expanded === s.id ? null : s.id)}
            className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm"
          >
            <span>
              <span className="font-medium">{s.authorName}</span>{" "}
              <span className="font-mono text-xs text-[var(--muted)]">· {s.language}</span>
            </span>
            <span className="tnum font-mono text-xs text-[var(--muted)]">{s.score}</span>
          </button>
          {s.note ? <p className="border-t border-[var(--line)] px-3 py-2 text-xs text-[var(--muted)]">{s.note}</p> : null}
          {expanded === s.id ? (
            <pre className="overflow-x-auto border-t border-[var(--line)] p-3 text-xs">
              <code>{s.code}</code>
            </pre>
          ) : null}
        </div>
      ))}
    </div>
  );
}
