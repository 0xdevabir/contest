"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Plus, Camera } from "lucide-react";

type GradeCell = {
  columnId: string;
  raw: number | null;
  lateMultiplier: number;
  computed: number | null;
  override: number | null;
  final: number | null;
  status: string;
  submissionCount: number;
  bestSubmissionId: string | null;
};

type ColumnMeta = {
  id: string;
  source: "ASSIGNMENT" | "CONTEST" | "MANUAL";
  title: string;
  maxPoints: number;
  weight: number;
  order: number;
  published: boolean;
};

type StudentRow = {
  userId: string;
  name: string;
  email: string;
  studentId: string | null;
  cells: Record<string, GradeCell>;
  total: number;
  maxTotal: number;
};

export function GradebookGrid({
  sectionId,
  students,
  columns,
}: {
  sectionId: string;
  students: StudentRow[];
  columns: ColumnMeta[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<{ studentId: string; columnId: string } | null>(null);
  const [newColumnOpen, setNewColumnOpen] = useState(false);

  async function snapshot() {
    const label = window.prompt("Label this snapshot (e.g. \"Midterm submission to department\")");
    if (!label) return;
    await fetch(`/api/teacher/sections/${sectionId}/gradebook/snapshot`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label }),
    });
    router.refresh();
  }

  const selectedStudent = selected ? students.find((s) => s.userId === selected.studentId) : null;
  const selectedColumn = selected ? columns.find((c) => c.id === selected.columnId) : null;
  const selectedCell = selectedStudent && selected ? selectedStudent.cells[selected.columnId] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <a href={`/api/teacher/sections/${sectionId}/gradebook.csv`} className="btn btn-ghost !text-xs">
            <Download size={13} aria-hidden /> Export CSV
          </a>
          <button type="button" onClick={() => void snapshot()} className="btn btn-ghost !text-xs">
            <Camera size={13} aria-hidden /> Snapshot
          </button>
          <button type="button" onClick={() => setNewColumnOpen((v) => !v)} className="btn btn-ghost !text-xs">
            <Plus size={13} aria-hidden /> New column
          </button>
        </div>
      </div>

      {newColumnOpen && <NewColumnForm sectionId={sectionId} onDone={() => { setNewColumnOpen(false); router.refresh(); }} />}

      {/* TODO: keyboard navigation between cells */}
      <div className="mt-3 max-h-[70vh] overflow-auto rounded-xl border border-[var(--line)]">
        <table className="w-full min-w-[800px] border-collapse text-left text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 border-b border-r border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                Student
              </th>
              {columns.map((c) => (
                <th
                  key={c.id}
                  className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-[10px] uppercase tracking-wide text-[var(--muted)]"
                >
                  {c.title}
                  <div className="mt-0.5 font-mono text-[9px] normal-case text-[var(--muted-dim,var(--muted))]">
                    ×{c.weight}{c.published ? "" : " · unpublished"}
                  </div>
                </th>
              ))}
              <th className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-[10px] uppercase tracking-wide text-[var(--muted)]">
                Total %
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {students.map((s) => (
              <tr key={s.userId}>
                <td className="sticky left-0 z-10 border-r border-[var(--line)] bg-[var(--bg-panel)] px-3 py-2 font-medium">
                  {s.name}
                  <div className="font-mono text-[9px] text-[var(--muted)]">{s.studentId ?? s.email}</div>
                </td>
                {columns.map((c) => {
                  const cell = s.cells[c.id];
                  const flagged = cell.status === "late" || cell.override != null;
                  return (
                    <td key={c.id} className="px-1 py-1">
                      <button
                        type="button"
                        onClick={() => setSelected({ studentId: s.userId, columnId: c.id })}
                        className={`w-full rounded px-2 py-1.5 text-left hover:bg-[var(--hover)] ${
                          flagged ? (cell.override != null ? "text-[var(--accent)]" : "text-[var(--warn)]") : ""
                        }`}
                      >
                        {cell.final != null ? Math.round(cell.final * 100) / 100 : "—"}
                      </button>
                    </td>
                  );
                })}
                <td className="px-3 py-2 font-mono">{Math.round(s.total * 100) / 100}</td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td colSpan={columns.length + 2} className="px-4 py-10 text-center text-[var(--muted)]">
                  No students enrolled yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && selectedStudent && selectedColumn && selectedCell && (
        <CellPanel
          sectionId={sectionId}
          studentName={selectedStudent.name}
          userId={selectedStudent.userId}
          column={selectedColumn}
          cell={selectedCell}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function CellPanel({
  sectionId,
  studentName,
  userId,
  column,
  cell,
  onClose,
  onSaved,
}: {
  sectionId: string;
  studentName: string;
  userId: string;
  column: ColumnMeta;
  cell: GradeCell;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [points, setPoints] = useState(cell.override ?? cell.computed ?? 0);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveOverride() {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/teacher/sections/${sectionId}/gradebook/override`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ columnId: column.id, userId, points, reason: reason || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(data.message ?? "Could not save override");
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold">
          {studentName} — {column.title}
        </p>

        <div className="mt-3 space-y-1 rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] p-3 font-mono text-[11px]">
          <p>raw: {cell.raw ?? "—"}</p>
          <p>× late multiplier: {cell.lateMultiplier}</p>
          <p>= computed: {cell.computed != null ? Math.round(cell.computed * 100) / 100 : "—"}</p>
          {cell.override != null && <p className="text-[var(--accent)]">override: {cell.override}</p>}
          <p className="font-semibold">final: {cell.final != null ? Math.round(cell.final * 100) / 100 : "—"}</p>
          <p className="text-[var(--muted)]">status: {cell.status} · {cell.submissionCount} submission(s)</p>
        </div>

        <div className="mt-3 grid gap-2">
          <label className="text-xs">
            <span className="mb-1 block text-[var(--muted)]">Override points</span>
            <input
              type="number"
              value={points}
              onChange={(e) => setPoints(Number(e.target.value))}
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-xs"
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-[var(--muted)]">Reason</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Partial credit for approach"
              className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-xs"
            />
          </label>
        </div>

        {error && <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>}

        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost !text-xs">
            Close
          </button>
          <button type="button" disabled={pending} onClick={() => void saveOverride()} className="btn btn-primary !text-xs">
            {pending ? "Saving…" : "Save override"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewColumnForm({ sectionId, onDone }: { sectionId: string; onDone: () => void }) {
  const [source, setSource] = useState<"MANUAL" | "CONTEST">("MANUAL");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/teacher/sections/${sectionId}/gradebook/columns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source,
        contestId: source === "CONTEST" ? form.get("contestId") : undefined,
        title: form.get("title"),
        maxPoints: Number(form.get("maxPoints") || 100),
        weight: Number(form.get("weight") || 1),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(data.message ?? "Could not create the column");
      return;
    }
    onDone();
  }

  const inputCls = "w-full rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-xs";

  return (
    <form onSubmit={onSubmit} className="mb-3 grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4 sm:grid-cols-4">
      <label className="text-xs">
        <span className="mb-1 block text-[var(--muted)]">Source</span>
        <select value={source} onChange={(e) => setSource(e.target.value as "MANUAL" | "CONTEST")} className={inputCls}>
          <option value="MANUAL">Manual (e.g. attendance)</option>
          <option value="CONTEST">Contest (lab quiz)</option>
        </select>
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-[var(--muted)]">Title</span>
        <input name="title" required className={inputCls} />
      </label>
      {source === "CONTEST" && (
        <label className="text-xs">
          <span className="mb-1 block text-[var(--muted)]">Contest ID</span>
          <input name="contestId" required placeholder="ROSTER contest id" className={inputCls} />
        </label>
      )}
      <label className="text-xs">
        <span className="mb-1 block text-[var(--muted)]">Max points</span>
        <input name="maxPoints" type="number" min="1" defaultValue={100} className={inputCls} />
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-[var(--muted)]">Weight</span>
        <input name="weight" type="number" step="0.1" min="0" defaultValue={1} className={inputCls} />
      </label>
      {error && <p className="text-xs text-[var(--danger)] sm:col-span-4">{error}</p>}
      <div className="sm:col-span-4">
        <button type="submit" disabled={pending} className="btn btn-primary !text-xs">
          {pending ? "Adding…" : "Add column"}
        </button>
      </div>
    </form>
  );
}
