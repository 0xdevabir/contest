"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, RefreshCw, ShieldQuestion } from "lucide-react";

type PairUser = { id: string; name: string; email: string };
type Region = { aStart: number; aEnd: number; bStart: number; bEnd: number };

type Pair = {
  id: string;
  scopeType: string;
  scopeId: string;
  problemId: string;
  submissionAId: string;
  submissionBId: string;
  userAId: string;
  userBId: string;
  similarity: number;
  zScore: number;
  sharedTokens: number;
  status: string;
  reviewNote: string;
  regions: Region[];
  submissionA: { user: PairUser | null };
  submissionB: { user: PairUser | null };
};

type Timeline = {
  events: { type: string; at: string; meta: unknown }[];
  totalAwayMs: number;
  blurCount: number;
  pasteCount: number;
};

/** D2's copy guidance: this is a triage tool, not a verdict. */
const STATUS_LABEL: Record<string, string> = {
  OPEN: "Needs review",
  DISMISSED: "Dismissed",
  CONFIRMED: "Confirmed",
  ESCALATED: "Escalated",
};

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function IntegrityConsole({
  scopeType,
  scopeId,
  contestId,
}: {
  scopeType: "contest" | "section" | "assignment";
  scopeId: string;
  /** Present only for a contest scope — proctor timelines are contest-scoped. */
  contestId?: string;
}) {
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [loading, setLoading] = useState(true);
  const [sweeping, setSweeping] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"scope" | "external">("scope");
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/teacher/integrity/pairs?scopeType=${scopeType}&scopeId=${scopeId}`
      );
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || "Failed to load pairs");
      setPairs(data.pairs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pairs");
    } finally {
      setLoading(false);
    }
  }, [scopeType, scopeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runSweep() {
    setSweeping(true);
    setError("");
    try {
      const res = await fetch("/api/teacher/integrity/sweep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopeType, scopeId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || "Sweep failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sweep failed");
    } finally {
      setSweeping(false);
    }
  }

  const scopePairs = pairs.filter((p) => p.scopeType === scopeType);
  const externalPairs = pairs.filter((p) => p.scopeType === "external");
  const shown = tab === "scope" ? scopePairs : externalPairs;
  const populationMedian = useMemo(() => median(scopePairs.map((p) => p.similarity)), [scopePairs]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" className="flex gap-1 rounded-lg border border-[var(--line)] bg-[var(--bg-panel)] p-1">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "scope"}
            onClick={() => setTab("scope")}
            className={`rounded px-3 py-1.5 text-xs font-medium ${
              tab === "scope" ? "bg-[var(--accent-surface)] text-[var(--accent)]" : "text-[var(--muted)]"
            }`}
          >
            Pairs ({scopePairs.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "external"}
            onClick={() => setTab("external")}
            className={`rounded px-3 py-1.5 text-xs font-medium ${
              tab === "external" ? "bg-[var(--accent-surface)] text-[var(--accent)]" : "text-[var(--muted)]"
            }`}
          >
            External matches ({externalPairs.length})
          </button>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void runSweep()} disabled={sweeping} className="btn btn-primary !py-2 !text-xs">
            <RefreshCw size={13} aria-hidden="true" className={sweeping ? "animate-spin" : ""} />
            {sweeping ? "Running sweep…" : "Run sweep"}
          </button>
          <a
            href={`/api/teacher/integrity/report.pdf?scopeType=${scopeType}&scopeId=${scopeId}`}
            className="btn btn-ghost !py-2 !text-xs"
          >
            <FileText size={13} aria-hidden="true" />
            Generate report
          </a>
        </div>
      </div>

      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-panel)]">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="border-b border-[var(--line)] text-[10px] uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Students</th>
              <th className="px-3 py-2 font-medium">Problem</th>
              <th className="px-3 py-2 font-medium">Similarity</th>
              <th className="px-3 py-2 font-medium">Z-score</th>
              <th className="px-3 py-2 font-medium">Shared tokens</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {loading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-[var(--muted)]">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && shown.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-[var(--muted)]">
                  No pairs yet — run a sweep.
                </td>
              </tr>
            )}
            {shown.map((p) => (
              <tr
                key={p.id}
                onClick={() => setSelected(p.id)}
                className="cursor-pointer hover:bg-[var(--hover)]"
              >
                <td className="px-3 py-2">
                  {(p.submissionA.user?.name ?? "Unknown")} / {(p.submissionB.user?.name ?? "Unknown")}
                </td>
                <td className="px-3 py-2 font-mono text-[10px]">{p.problemId}</td>
                <td className="px-3 py-2">
                  {Math.round(p.similarity * 100)}%
                  <span className="ml-1 text-[10px] text-[var(--muted)]">
                    (median {Math.round(populationMedian * 100)}%)
                  </span>
                </td>
                <td className="px-3 py-2">{p.zScore.toFixed(1)}</td>
                <td className="px-3 py-2">{p.sharedTokens}</td>
                <td className="px-3 py-2">
                  <StatusPill status={p.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <PairDetail
          pairId={selected}
          onClose={() => setSelected(null)}
          onDisposed={() => {
            setSelected(null);
            void load();
          }}
          contestId={contestId}
        />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "CONFIRMED" || status === "ESCALATED"
      ? "border-[var(--danger-border)] bg-[var(--danger-surface)] text-[var(--danger)]"
      : status === "DISMISSED"
        ? "border-[var(--line)] text-[var(--muted)]"
        : "border-[var(--warn-border)] bg-[var(--warn-surface)] text-[var(--warn)]";
  return <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${tone}`}>{STATUS_LABEL[status] ?? status}</span>;
}

function tokenSpan(tokens: string[], start: number, end: number, highlighted: [number, number][]) {
  const isHighlighted = (i: number) => highlighted.some(([s, e]) => i >= s && i <= e);
  return tokens.slice(start, end).map((t, i) => {
    const idx = start + i;
    return (
      <span
        key={idx}
        className={isHighlighted(idx) ? "rounded bg-[var(--warn-surface)] px-0.5 text-[var(--warn)]" : undefined}
      >
        {t}{" "}
      </span>
    );
  });
}

function PairDetail({
  pairId,
  onClose,
  onDisposed,
  contestId,
}: {
  pairId: string;
  onClose: () => void;
  onDisposed: () => void;
  contestId?: string;
}) {
  const [detail, setDetail] = useState<{
    pair: Pair & { submissionA: { language: string; user: PairUser | null }; submissionB: { language: string; user: PairUser | null } };
    aTokens: string[];
    bTokens: string[];
  } | null>(null);
  const [rawA, setRawA] = useState<string | null>(null);
  const [rawB, setRawB] = useState<string | null>(null);
  const [view, setView] = useState<"normalized" | "raw">("normalized");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [timelineA, setTimelineA] = useState<Timeline | null>(null);
  const [timelineB, setTimelineB] = useState<Timeline | null>(null);

  useEffect(() => {
    fetch(`/api/teacher/integrity/pairs/${pairId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) setDetail(data);
      });
  }, [pairId]);

  async function loadRaw() {
    if (!detail) return;
    if (rawA == null) {
      const a = await fetch(`/api/submissions/${detail.pair.submissionAId}`).then((r) => r.json());
      setRawA(a.code ?? "");
    }
    if (rawB == null) {
      const b = await fetch(`/api/submissions/${detail.pair.submissionBId}`).then((r) => r.json());
      setRawB(b.code ?? "");
    }
  }

  async function loadTimelines() {
    if (!contestId || !detail) return;
    const [pA, pB] = await Promise.all([
      fetch(`/api/teacher/integrity/timeline?contestId=${contestId}&userId=${detail.pair.userAId}`)
        .then((r) => r.json())
        .catch(() => null),
      fetch(`/api/teacher/integrity/timeline?contestId=${contestId}&userId=${detail.pair.userBId}`)
        .then((r) => r.json())
        .catch(() => null),
    ]);
    if (pA?.ok) setTimelineA(pA.timeline);
    if (pB?.ok) setTimelineB(pB.timeline);
  }

  async function disposition(status: "DISMISSED" | "CONFIRMED" | "ESCALATED") {
    setBusy(true);
    try {
      await fetch(`/api/teacher/integrity/pairs/${pairId}/disposition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note }),
      });
      onDisposed();
    } finally {
      setBusy(false);
    }
  }

  if (!detail) {
    return (
      <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4 text-xs text-[var(--muted)]">
        Loading pair…
      </div>
    );
  }

  const aHighlight = detail.pair.regions.map((r) => [r.aStart, r.aEnd] as [number, number]);
  const bHighlight = detail.pair.regions.map((r) => [r.bStart, r.bEnd] as [number, number]);

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <ShieldQuestion size={14} className="text-[var(--muted)]" aria-hidden="true" />
          <span className="font-medium">
            {detail.pair.submissionA.user?.name ?? "Unknown"} vs {detail.pair.submissionB.user?.name ?? "Unknown"}
          </span>
          <StatusPill status={detail.pair.status} />
        </div>
        <div className="flex items-center gap-2">
          <div role="tablist" className="flex gap-1 rounded-lg border border-[var(--line)] p-0.5">
            <button
              type="button"
              onClick={() => setView("normalized")}
              className={`rounded px-2 py-1 text-[10px] ${view === "normalized" ? "bg-[var(--accent-surface)] text-[var(--accent)]" : "text-[var(--muted)]"}`}
            >
              Normalized
            </button>
            <button
              type="button"
              onClick={() => {
                setView("raw");
                void loadRaw();
              }}
              className={`rounded px-2 py-1 text-[10px] ${view === "raw" ? "bg-[var(--accent-surface)] text-[var(--accent)]" : "text-[var(--muted)]"}`}
            >
              Raw source
            </button>
          </div>
          <button type="button" onClick={onClose} className="text-[10px] text-[var(--muted)] hover:text-[var(--text)]">
            Close
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <pre className="max-h-80 overflow-auto rounded-lg border border-[var(--line)] bg-[var(--sunken)] p-3 font-mono text-[10px] leading-relaxed">
          {view === "normalized"
            ? tokenSpan(detail.aTokens, 0, detail.aTokens.length, aHighlight)
            : (rawA ?? "Loading…")}
        </pre>
        <pre className="max-h-80 overflow-auto rounded-lg border border-[var(--line)] bg-[var(--sunken)] p-3 font-mono text-[10px] leading-relaxed">
          {view === "normalized"
            ? tokenSpan(detail.bTokens, 0, detail.bTokens.length, bHighlight)
            : (rawB ?? "Loading…")}
        </pre>
      </div>

      {contestId && (
        <div className="mt-3">
          <button type="button" onClick={() => void loadTimelines()} className="text-[10px] text-[var(--accent)] hover:underline">
            Load proctor timelines
          </button>
          {(timelineA || timelineB) && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <TimelineStrip label={detail.pair.submissionA.user?.name ?? "Student A"} timeline={timelineA} />
              <TimelineStrip label={detail.pair.submissionB.user?.name ?? "Student B"} timeline={timelineB} />
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Reason / note (optional)"
          className="min-w-[220px] flex-1 rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs outline-none"
        />
        <button type="button" disabled={busy} onClick={() => void disposition("DISMISSED")} className="btn btn-ghost !py-1.5 !text-xs">
          Dismiss
        </button>
        <button type="button" disabled={busy} onClick={() => void disposition("CONFIRMED")} className="btn btn-ghost !py-1.5 !text-xs">
          Confirm
        </button>
        <button type="button" disabled={busy} onClick={() => void disposition("ESCALATED")} className="btn btn-primary !py-1.5 !text-xs">
          Escalate
        </button>
      </div>
    </div>
  );
}

function TimelineStrip({ label, timeline }: { label: string; timeline: Timeline | null }) {
  if (!timeline) return null;
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--sunken)] p-2 text-[10px]">
      <p className="font-medium">{label}</p>
      <p className="mt-1 text-[var(--muted)]">
        {timeline.blurCount} tab switches · {timeline.pasteCount} pastes · {Math.round(timeline.totalAwayMs / 1000)}s away
      </p>
    </div>
  );
}
