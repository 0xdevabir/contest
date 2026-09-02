"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Course = { id: string; code: string; title: string };
type Semester = { id: string; name: string; code: string };

export function NewSectionForm({ courses, semesters }: { courses: Course[]; semesters: Semester[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [semesterList, setSemesterList] = useState(semesters);
  const [semesterId, setSemesterId] = useState(semesters[0]?.id ?? "");
  const [showNewSemester, setShowNewSemester] = useState(semesters.length === 0);
  const [newSemester, setNewSemester] = useState({ name: "", code: "", startsAt: "", endsAt: "" });
  const [semesterPending, setSemesterPending] = useState(false);

  async function saveSemester() {
    setSemesterPending(true);
    setError(null);
    const res = await fetch("/api/teacher/semesters", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: newSemester.name,
        code: newSemester.code,
        startsAt: newSemester.startsAt ? new Date(newSemester.startsAt).toISOString() : "",
        endsAt: newSemester.endsAt ? new Date(newSemester.endsAt).toISOString() : "",
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSemesterPending(false);
    if (!res.ok) {
      setError(data.message ?? "Could not create semester");
      return;
    }
    setSemesterList((prev) => [data.semester, ...prev]);
    setSemesterId(data.semester.id);
    setShowNewSemester(false);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/teacher/sections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        courseId: form.get("courseId"),
        semesterId,
        name: form.get("name"),
        openEnroll: form.get("openEnroll") === "on",
      }),
    });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setError(data.message ?? "Could not create section");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary !text-xs">
        New section
      </button>
    );
  }

  const inputCls = "w-full rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2 text-xs";

  return (
    <form
      onSubmit={onSubmit}
      className="mt-4 grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4 sm:grid-cols-2"
    >
      <label className="text-xs">
        <span className="mb-1 block text-[var(--muted)]">Course</span>
        <select name="courseId" required className={inputCls}>
          {courses.length === 0 && <option value="">No courses yet — create one first</option>}
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.title}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-[var(--muted)]">Section name</span>
        <input name="name" required placeholder="Section B" className={inputCls} />
      </label>

      <div className="text-xs sm:col-span-2">
        <span className="mb-1 block text-[var(--muted)]">Semester</span>
        {!showNewSemester ? (
          <div className="flex items-center gap-2">
            <select value={semesterId} onChange={(e) => setSemesterId(e.target.value)} className={inputCls}>
              {semesterList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
            <button type="button" onClick={() => setShowNewSemester(true)} className="btn btn-ghost !text-xs whitespace-nowrap">
              New semester
            </button>
          </div>
        ) : (
          <div className="grid gap-2 rounded-lg border border-[var(--line)] p-3 sm:grid-cols-4">
            <input
              placeholder="Fall 2026"
              value={newSemester.name}
              onChange={(e) => setNewSemester((s) => ({ ...s, name: e.target.value }))}
              className={inputCls}
            />
            <input
              placeholder="2026F"
              value={newSemester.code}
              onChange={(e) => setNewSemester((s) => ({ ...s, code: e.target.value }))}
              className={inputCls}
            />
            <input
              type="date"
              value={newSemester.startsAt}
              onChange={(e) => setNewSemester((s) => ({ ...s, startsAt: e.target.value }))}
              className={inputCls}
            />
            <input
              type="date"
              value={newSemester.endsAt}
              onChange={(e) => setNewSemester((s) => ({ ...s, endsAt: e.target.value }))}
              className={inputCls}
            />
            <div className="col-span-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={semesterPending || !newSemester.name || !newSemester.code || !newSemester.startsAt || !newSemester.endsAt}
                onClick={() => void saveSemester()}
                className="btn btn-ghost !text-xs"
              >
                {semesterPending ? "Saving…" : "Save semester"}
              </button>
              {semesterList.length > 0 && (
                <button type="button" onClick={() => setShowNewSemester(false)} className="btn btn-ghost !text-xs">
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs sm:col-span-2">
        <input name="openEnroll" type="checkbox" />
        Students may self-enrol with the invite code, without teacher approval
      </label>

      {error && <p className="text-xs text-[var(--danger)] sm:col-span-2">{error}</p>}

      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={pending || !semesterId} className="btn btn-primary !text-xs">
          {pending ? "Creating…" : "Create section"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost !text-xs">
          Cancel
        </button>
      </div>
    </form>
  );
}
