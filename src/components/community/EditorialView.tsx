"use client";

import { useEffect, useState } from "react";
import { BookOpen, TriangleAlert } from "lucide-react";

type Solution = { language: string; source: string; note: string };
type EditorialData = {
  contentHtml: string;
  solutions: Solution[];
  author: { name: string };
};

/**
 * D1's "explicit action plus a clear warning" gate: a solve-agnostic
 * problem browser only sees the editorial after clicking through a warning
 * (unless they've already solved it, in which case the first fetch — no
 * `reveal` — already returns content).
 */
export function EditorialView({ problemId }: { problemId: string }) {
  const [state, setState] = useState<"loading" | "gated" | "empty" | "ready">("loading");
  const [reason, setReason] = useState<string | null>(null);
  const [editorial, setEditorial] = useState<EditorialData | null>(null);

  async function load(reveal: boolean) {
    setState("loading");
    const res = await fetch(`/api/problems/${problemId}/editorial${reveal ? "?reveal=1" : ""}`);
    const data = await res.json();
    if (res.status === 404) {
      setState("empty");
      return;
    }
    if (!data.ok) {
      setReason(data.message ?? "Editorial not available yet.");
      setState("gated");
      return;
    }
    setEditorial(data.editorial);
    setState("ready");
  }

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemId]);

  if (state === "loading") return <p className="text-xs text-[var(--muted)]">Loading…</p>;

  if (state === "empty") {
    return <p className="text-sm text-[var(--muted)]">No editorial has been published for this problem yet.</p>;
  }

  if (state === "gated") {
    return (
      <div className="rounded-xl border border-[var(--warn)]/30 bg-[var(--warn-surface)] p-5 text-center">
        <TriangleAlert className="mx-auto text-[var(--warn)]" size={22} aria-hidden />
        <p className="mt-2 text-sm text-[var(--warn)]">{reason}</p>
        <button type="button" onClick={() => void load(true)} className="btn btn-ghost !mt-3 !text-xs">
          Show editorial anyway — this will spoil the solution
        </button>
      </div>
    );
  }

  if (!editorial) return null;

  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <BookOpen size={15} aria-hidden />
        Editorial <span className="text-xs font-normal text-[var(--muted)]">by {editorial.author.name}</span>
      </h3>
      <div
        className="prose prose-sm max-w-none text-sm text-[var(--text)]"
        dangerouslySetInnerHTML={{ __html: editorial.contentHtml }}
      />
      {editorial.solutions.length > 0 ? (
        <div className="mt-5 space-y-3">
          <h4 className="eyebrow">Reference solutions</h4>
          {editorial.solutions.map((s, i) => (
            <div key={i} className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted)]">
                <span className="font-mono">{s.language}</span>
                {s.note ? <span>{s.note}</span> : null}
              </div>
              <pre className="overflow-x-auto p-3 text-xs"><code>{s.source}</code></pre>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
