"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type PreviewRow = {
  line: number;
  email?: string;
  studentId?: string;
  name?: string;
  outcome: "matched" | "invited" | "duplicate" | "invalid";
  reason?: string;
};

type PreviewResponse = {
  ok: boolean;
  message?: string;
  detectedColumns: Record<string, number>;
  mapping: { email?: string; studentId?: string; name?: string };
  warnings: string[];
  rawRows: Record<string, string>[];
  preview: PreviewRow[];
  summary: { matched: number; invited: number; duplicate: number; invalid: number };
};

const OUTCOME_STYLE: Record<PreviewRow["outcome"], string> = {
  matched: "border-[var(--accent-dim)] text-[var(--accent)]",
  invited: "border-[var(--info)]/30 text-[var(--info)]",
  duplicate: "border-[var(--warn)]/30 text-[var(--warn)]",
  invalid: "border-[var(--danger)]/30 text-[var(--danger)]",
};

export function RosterWizard({ sectionId }: { sectionId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "preview">("upload");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [removeMissing, setRemoveMissing] = useState(false);

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a .csv or .xlsx file first");
      return;
    }
    setPending(true);
    setError(null);
    const form = new FormData();
    form.set("file", file);
    const res = await fetch(`/api/teacher/sections/${sectionId}/roster/preview`, { method: "POST", body: form });
    const data = (await res.json().catch(() => ({}))) as PreviewResponse;
    setPending(false);
    if (!res.ok) {
      setError(data.message ?? "Could not parse that file");
      return;
    }
    setPreview(data);
    setStep("preview");
  }

  async function confirmImport() {
    if (!preview) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/api/teacher/sections/${sectionId}/roster/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows: preview.rawRows, mapping: preview.mapping, removeMissing }),
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(data.message ?? "Import failed");
      return;
    }
    setStep("upload");
    setPreview(null);
    router.refresh();
  }

  if (step === "upload") {
    return (
      <form onSubmit={onUpload} className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
        <p className="text-sm font-semibold">Import roster</p>
        <p className="mt-1 text-xs text-[var(--muted)]">
          A registrar CSV or Excel export. Headers are detected automatically; nothing is written
          until you confirm the preview.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="text-xs" />
          <button type="submit" disabled={pending} className="btn btn-primary !text-xs">
            {pending ? "Parsing…" : "Preview"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>}
      </form>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Preview</p>
        <div className="flex gap-3 text-[11px] text-[var(--muted)]">
          <span>{preview!.summary.matched} matched</span>
          <span>{preview!.summary.invited} invited</span>
          <span>{preview!.summary.duplicate} duplicate</span>
          <span>{preview!.summary.invalid} invalid</span>
        </div>
      </div>
      {preview!.warnings.length > 0 && (
        <ul className="mt-2 space-y-1 text-[11px] text-[var(--warn)]">
          {preview!.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-[var(--line)]">
        <table className="w-full min-w-[500px] text-left text-xs">
          <thead className="sticky top-0 border-b border-[var(--line)] bg-[var(--bg-elevated)] text-[10px] uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Row</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Student ID</th>
              <th className="px-3 py-2 font-medium">Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {preview!.preview.map((row) => (
              <tr key={row.line}>
                <td className="px-3 py-2 text-[var(--muted)]">{row.line}</td>
                <td className="px-3 py-2">{row.name ?? "—"}</td>
                <td className="px-3 py-2">{row.email ?? "—"}</td>
                <td className="px-3 py-2">{row.studentId ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${OUTCOME_STYLE[row.outcome]}`}>
                    {row.outcome.toUpperCase()}
                  </span>
                  {row.reason && <span className="ml-2 text-[10px] text-[var(--muted)]">{row.reason}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <label className="mt-3 flex items-center gap-2 text-xs">
        <input type="checkbox" checked={removeMissing} onChange={(e) => setRemoveMissing(e.target.checked)} />
        Drop existing students who are missing from this file
      </label>

      {error && <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button type="button" disabled={pending} onClick={() => void confirmImport()} className="btn btn-primary !text-xs">
          {pending ? "Importing…" : "Confirm import"}
        </button>
        <button
          type="button"
          onClick={() => {
            setStep("upload");
            setPreview(null);
          }}
          className="btn btn-ghost !text-xs"
        >
          Start over
        </button>
      </div>
    </div>
  );
}
