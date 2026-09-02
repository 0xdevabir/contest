"use client";

import { useEffect, useMemo, useState } from "react";

type Student = { userId: string; name: string };
type ProblemCol = { problemId: string; title: string; assignmentId: string; assignmentTitle: string; label: string };
type Cell = { userId: string; problemId: string; bestVerdict: string | null; attempts: number };

type CellSubmission = {
  id: string;
  verdict: string;
  score: number;
  maxScore: number;
  language: string;
  createdAt: string;
  maxCpuMs: number | null;
  maxMemoryKb: number | null;
};

function verdictClass(verdict: string | null): string {
  if (!verdict) return "bg-[var(--line-soft)]";
  if (verdict === "AC") return "bg-[var(--accent)]";
  if (verdict === "TLE" || verdict === "MLE" || verdict === "OLE") return "bg-[var(--warn)]";
  if (verdict === "PENDING" || verdict === "JUDGING") return "bg-[var(--info)]";
  return "bg-[var(--danger)]";
}

/**
 * D3 — the anchor screen. A vertical stripe of one color is a broken
 * problem; a horizontal stripe is a stuck student; an empty row hasn't
 * started. CSS grid of divs (not table/SVG/canvas) with `content-visibility:
 * auto` per row so a 60x40 grid stays cheap to paint.
 */
export function Heatmap({
  sectionId,
  students,
  problems,
  cells,
}: {
  sectionId: string;
  students: Student[];
  problems: ProblemCol[];
  cells: Cell[];
}) {
  const [panel, setPanel] = useState<{ userId: string; problemId: string; studentName: string; problemTitle: string } | null>(null);

  const cellByKey = useMemo(() => {
    const m = new Map<string, Cell>();
    for (const c of cells) m.set(`${c.userId}:${c.problemId}`, c);
    return m;
  }, [cells]);

  if (students.length === 0 || problems.length === 0) {
    return <p className="text-xs text-[var(--muted)]">No published assignments with problems yet.</p>;
  }

  return (
    <div className="overflow-auto rounded-xl border border-[var(--line)]">
      <div className="inline-grid" style={{ gridTemplateColumns: `160px repeat(${problems.length}, 22px)` }}>
        <div className="sticky top-0 left-0 z-30 border-b border-r border-[var(--line)] bg-[var(--bg-elevated)]" />
        {problems.map((p) => (
          <div
            key={p.problemId}
            title={`${p.assignmentTitle} — ${p.title}`}
            className="sticky top-0 z-20 flex h-24 items-end justify-center border-b border-[var(--line)] bg-[var(--bg-elevated)] pb-1"
          >
            <span className="rotate-[-55deg] whitespace-nowrap font-mono text-[9px] text-[var(--muted)]">{p.label}</span>
          </div>
        ))}

        {students.map((s) => (
          <div key={s.userId} className="contents" style={{ contentVisibility: "auto" }}>
            <div className="sticky left-0 z-10 truncate border-b border-r border-[var(--line)] bg-[var(--bg-panel)] px-2 py-1 text-[11px]">
              {s.name}
            </div>
            {problems.map((p) => {
              const cell = cellByKey.get(`${s.userId}:${p.problemId}`);
              return (
                <button
                  key={p.problemId}
                  type="button"
                  title={`${s.name} — ${p.title}: ${cell?.bestVerdict ?? "not attempted"}`}
                  onClick={() =>
                    cell &&
                    setPanel({ userId: s.userId, problemId: p.problemId, studentName: s.name, problemTitle: p.title })
                  }
                  disabled={!cell}
                  className={`h-[22px] w-[22px] border-b border-[var(--bg-panel)] ${verdictClass(cell?.bestVerdict ?? null)} ${
                    cell ? "cursor-pointer hover:opacity-80" : "cursor-default opacity-40"
                  }`}
                />
              );
            })}
          </div>
        ))}
      </div>

      {panel && (
        <CellPanel sectionId={sectionId} {...panel} onClose={() => setPanel(null)} />
      )}
    </div>
  );
}

function CellPanel({
  sectionId,
  userId,
  problemId,
  studentName,
  problemTitle,
  onClose,
}: {
  sectionId: string;
  userId: string;
  problemId: string;
  studentName: string;
  problemTitle: string;
  onClose: () => void;
}) {
  const [submissions, setSubmissions] = useState<CellSubmission[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/teacher/sections/${sectionId}/heatmap/cell?userId=${userId}&problemId=${problemId}`)
      .then((r) => r.json())
      .then((data) => {
        setSubmissions(data.ok ? data.submissions : []);
        setLoading(false);
      })
      .catch(() => {
        setSubmissions([]);
        setLoading(false);
      });
  }, [sectionId, userId, problemId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-md overflow-auto rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold">
          {studentName} — {problemTitle}
        </p>
        <div className="mt-3 space-y-2">
          {loading && <p className="text-xs text-[var(--muted)]">Loading…</p>}
          {!loading && submissions?.length === 0 && <p className="text-xs text-[var(--muted)]">No submissions.</p>}
          {submissions?.map((s) => (
            <div key={s.id} className="rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] p-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className={`font-mono ${verdictClass(s.verdict).replace("bg-", "text-")}`}>{s.verdict}</span>
                <span className="text-[var(--muted)]">{s.language}</span>
              </div>
              <p className="mt-1 text-[var(--muted)]">
                {s.score}/{s.maxScore} · {new Date(s.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={onClose} className="btn btn-ghost !text-xs">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
