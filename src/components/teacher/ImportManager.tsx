"use client";

import { useEffect, useRef, useState } from "react";

type ReportRow = { item: string; ok: boolean; problemId?: string; slug?: string; message?: string; warnings?: string[] };
type ImportJob = {
  id: string;
  kind: string;
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED";
  total: number;
  imported: number;
  failed: number;
  report: ReportRow[];
  createdAt: string;
};

export function ImportManager() {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [kind, setKind] = useState<"polygon" | "generic" | "csv">("polygon");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function refresh() {
    fetch("/api/teacher/import")
      .then((r) => r.json())
      .then((data) => setJobs(data.jobs ?? []));
  }

  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("kind", kind);
      await fetch("/api/teacher/import", { method: "POST", body: form });
      if (fileRef.current) fileRef.current.value = "";
      refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[var(--line)] p-4">
        <p className="mb-2 text-sm font-medium">Upload a package</p>
        <div className="flex flex-wrap items-center gap-3">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="polygon">Polygon (.zip)</option>
            <option value="generic">Generic (.zip)</option>
            <option value="csv">CSV bank (.csv)</option>
          </select>
          <input ref={fileRef} type="file" accept={kind === "csv" ? ".csv" : ".zip"} className="text-xs" />
          <button type="button" className="btn btn-primary !py-1.5 !text-xs" disabled={busy} onClick={upload}>
            Import
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {jobs.map((job) => (
          <div key={job.id} className="rounded-lg border border-[var(--line)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {job.kind} — {job.status}
              </p>
              <p className="text-xs text-[var(--muted)]">
                {job.imported} imported / {job.failed} failed / {job.total} total
              </p>
            </div>
            {job.report?.length ? (
              <ul className="mt-3 space-y-1 text-xs">
                {job.report.map((r, i) => (
                  <li key={i} className={r.ok ? "text-green-400" : "text-red-400"}>
                    {r.ok ? "✓" : "✗"} {r.item} {r.slug ? `(${r.slug})` : ""} {r.message ? `— ${r.message}` : ""}
                    {r.warnings?.length ? (
                      <ul className="ml-4 list-disc text-[var(--muted)]">
                        {r.warnings.map((w, wi) => (
                          <li key={wi}>{w}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
        {jobs.length === 0 ? <p className="text-xs text-[var(--muted)]">No imports yet.</p> : null}
      </div>
    </div>
  );
}
