"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DIFFICULTY_ORDER } from "@/lib/difficulty";

function slugify(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function NewProblemForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload = {
      title,
      slug: slug || slugify(title),
      difficulty: String(form.get("difficulty")),
      visibility: String(form.get("visibility")),
      statementMd: String(form.get("statementMd") ?? ""),
    };
    try {
      const res = await fetch("/api/teacher/problems", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.message ?? "Could not create problem");
        return;
      }
      router.push(`/teacher/problems/${data.problem.id}/edit`);
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-5 rounded-xl border border-[var(--line)] p-5">
      <label className="block">
        <span className="text-xs font-medium">Title</span>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          required
          minLength={3}
          className="field mt-1"
          placeholder="Two Sum"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium">Slug (URL id)</span>
        <input
          value={slug}
          onChange={(e) => {
            setSlug(slugify(e.target.value));
            setSlugTouched(true);
          }}
          required
          minLength={3}
          pattern="[a-z0-9][a-z0-9-]*"
          className="field mt-1 font-mono"
        />
        <p className="mt-1 text-[11px] text-[var(--muted)]">/problems/{slug || "…"}</p>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium">Difficulty</span>
          <select name="difficulty" required className="field mt-1" defaultValue="EASY">
            {DIFFICULTY_ORDER.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium">Visibility</span>
          <select name="visibility" required className="field mt-1" defaultValue="PRIVATE">
            <option value="PRIVATE">Private (you only)</option>
            <option value="INSTITUTION">My institution</option>
            <option value="PUBLIC">Public archive</option>
          </select>
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-medium">Statement (Markdown + LaTeX)</span>
        <textarea
          name="statementMd"
          rows={6}
          className="field mt-1 font-mono text-xs"
          placeholder={"Given an array, find two indices whose values sum to $k$..."}
        />
      </label>

      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}

      <button type="submit" disabled={busy} className="btn btn-primary !text-xs disabled:opacity-60">
        {busy ? "Creating…" : "Create problem"}
      </button>
    </form>
  );
}
