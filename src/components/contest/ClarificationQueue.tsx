"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Megaphone } from "lucide-react";

type Clarification = {
  id: string;
  userId: string;
  problemId: string | null;
  question: string;
  answer: string | null;
  status: "OPEN" | "ANSWERED" | "PROMOTED" | "CLOSED";
  createdAt: string;
  user: { name: string };
};

const CANNED: Array<{ id: "no-comment" | "read-problem" | "see-announcement"; label: string }> = [
  { id: "no-comment", label: "No comment" },
  { id: "read-problem", label: "Read the problem statement" },
  { id: "see-announcement", label: "See announcement" },
];

/**
 * D1 (docs/phases/PHASE-07-live-contest.md) — staff triage: filter by
 * status/problem, a per-problem "answered" indicator so duplicates are
 * obvious, canned responses, and answer-and-promote in one action.
 */
export function ClarificationQueue({
  contestId,
  problems,
}: {
  contestId: string;
  problems: Array<{ problemId: string; label: string }>;
}) {
  const [items, setItems] = useState<Clarification[]>([]);
  const [statusFilter, setStatusFilter] = useState<"OPEN" | "ALL">("OPEN");
  const [problemFilter, setProblemFilter] = useState("");
  const [draftById, setDraftById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const labelOf = useMemo(() => new Map(problems.map((p) => [p.problemId, p.label])), [problems]);

  const load = () => {
    fetch(`/api/contests/${contestId}/clarifications`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setItems(d.clarifications);
      })
      .catch(() => undefined);
  };

  useEffect(load, [contestId]);

  const answeredProblems = useMemo(
    () => new Set(items.filter((i) => i.status !== "OPEN").map((i) => i.problemId).filter(Boolean) as string[]),
    [items]
  );

  const filtered = items.filter(
    (i) => (statusFilter === "ALL" || i.status === "OPEN") && (!problemFilter || i.problemId === problemFilter)
  );

  async function answer(id: string, opts: { answer?: string; canned?: string; promote?: boolean }) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/contests/${contestId}/clarifications/${id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts),
      });
      const d = await res.json();
      if (d.ok) {
        setItems((prev) => prev.map((i) => (i.id === id ? d.clarification : i)));
        setDraftById((prev) => ({ ...prev, [id]: "" }));
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === "OPEN" ? "ALL" : "OPEN")}
          className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium ${
            statusFilter === "OPEN"
              ? "border-[var(--accent-border)] bg-[var(--accent-surface)] text-[var(--accent)]"
              : "border-[var(--line)] text-[var(--muted)]"
          }`}
        >
          {statusFilter === "OPEN" ? "Open only" : "All threads"}
        </button>
        <select
          value={problemFilter}
          onChange={(e) => setProblemFilter(e.target.value)}
          className="rounded-lg border border-[var(--line)] bg-[var(--sunken)] px-2 py-1.5 text-[11px] outline-none"
        >
          <option value="">All problems</option>
          {problems.map((p) => (
            <option key={p.problemId} value={p.problemId}>
              {p.label} {answeredProblems.has(p.problemId) ? "· answered" : ""}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="panel px-5 py-14 text-center">
          <p className="text-sm text-[var(--muted)]">No clarifications match this filter.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((c) => (
            <li key={c.id} className="panel p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.question}</p>
                  <p className="mt-1 font-mono text-[11px] text-[var(--muted)]">
                    {c.user.name}
                    {c.problemId && <> · {labelOf.get(c.problemId) ?? c.problemId}</>}
                    {" · "}
                    {c.status}
                  </p>
                </div>
              </div>

              {c.answer && (
                <p className="mt-2 rounded-lg bg-[var(--sunken)] px-3 py-2 text-xs text-[var(--text)]">{c.answer}</p>
              )}

              {c.status === "OPEN" && (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {CANNED.map((canned) => (
                      <button
                        key={canned.id}
                        type="button"
                        disabled={busyId === c.id}
                        onClick={() => answer(c.id, { canned: canned.id })}
                        className="btn btn-ghost !px-2 !py-1 !text-[11px]"
                      >
                        {canned.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      value={draftById[c.id] ?? ""}
                      onChange={(e) => setDraftById((prev) => ({ ...prev, [c.id]: e.target.value }))}
                      placeholder="Custom answer…"
                      className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--sunken)] px-2.5 py-1.5 text-xs outline-none"
                    />
                    <button
                      type="button"
                      disabled={busyId === c.id || !draftById[c.id]?.trim()}
                      onClick={() => answer(c.id, { answer: draftById[c.id] })}
                      className="btn btn-ghost !px-2.5 !py-1.5 !text-[11px]"
                    >
                      <Check size={12} aria-hidden="true" />
                      Answer
                    </button>
                    <button
                      type="button"
                      disabled={busyId === c.id || !draftById[c.id]?.trim()}
                      onClick={() => answer(c.id, { answer: draftById[c.id], promote: true })}
                      className="btn btn-primary !px-2.5 !py-1.5 !text-[11px]"
                    >
                      <Megaphone size={12} aria-hidden="true" />
                      Answer &amp; announce
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
