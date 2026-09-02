"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, FileText, Gavel, Save, Settings2, ShieldCheck } from "lucide-react";
import {
  ProblemSelector,
  type AdminProblemOption,
} from "@/components/admin/ProblemSelector";

export type ContestEditorValue = {
  id?: string;
  title: string;
  description: string;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  problemIds: string[];
  visibility: "PUBLIC" | "UNLISTED" | "INSTITUTION" | "PRIVATE";
  joinPolicy: "OPEN" | "CODE" | "PASSWORD" | "ROSTER" | "INVITE" | "STAFF_ONLY";
  rules: {
    scoring: "icpc" | "ioi" | "cf" | "assignment";
    freezeMinutes: number;
    penaltyPerWrong: number;
    maxSubmissionsPerProblem: number;
    publishAfterEnd: boolean;
    allowPracticeAfter: boolean;
    allowVirtual: boolean;
    showSamples: boolean;
    strictMode: boolean;
    notes: string;
  };
};

const inputClass =
  "mt-1.5 w-full rounded-lg border border-[var(--line)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-[var(--muted)]/60 focus:border-[var(--accent-dim)]";

const SCORING_OPTIONS: Array<{ id: ContestEditorValue["rules"]["scoring"]; label: string; description: string }> = [
  {
    id: "icpc",
    label: "ICPC",
    description: "Rank by number solved, ties broken by time and wrong-attempt penalties. Best for contests.",
  },
  {
    id: "ioi",
    label: "IOI",
    description: "Rank by total points across subtasks, no penalties. Best for exams with partial credit.",
  },
  {
    id: "cf",
    label: "Codeforces",
    description: "Points decay with time and wrong attempts. Best for open, time-pressured rounds.",
  },
  {
    id: "assignment",
    label: "Assignment",
    description: "Points reduced for late submissions past the due date. Best for homework, not live contests.",
  },
];

const VISIBILITY_OPTIONS: Array<{ id: ContestEditorValue["visibility"]; label: string; description: string }> = [
  { id: "PUBLIC", label: "Public", description: "Listed on /contests, indexed." },
  { id: "UNLISTED", label: "Unlisted", description: "Reachable by link, not listed." },
  { id: "INSTITUTION", label: "Institution", description: "Listed to your institution's members only." },
  { id: "PRIVATE", label: "Private", description: "Invisible except to staff and participants." },
];

const JOIN_POLICY_OPTIONS: Array<{ id: ContestEditorValue["joinPolicy"]; label: string }> = [
  { id: "OPEN", label: "Open — anyone who can see it may register" },
  { id: "CODE", label: "Code — requires a join code" },
  { id: "PASSWORD", label: "Password — requires a code and password" },
  { id: "ROSTER", label: "Roster — auto-scoped to a course section (Phase 6)" },
  { id: "INVITE", label: "Invite only" },
  { id: "STAFF_ONLY", label: "Staff only — no participants, a test run" },
];

export function ContestEditor({
  problems,
  initial,
  apiBase = "/api/admin/contests",
}: {
  problems: AdminProblemOption[];
  initial?: ContestEditorValue;
  /** Admin routes by default; teacher pages pass "/api/teacher/contests". */
  apiBase?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(
    initial?.problemIds ?? ["set1-q1", "set1-q2", "set1-q3"]
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [publishAfterEnd, setPublishAfterEnd] = useState(
    initial?.rules.publishAfterEnd ?? false
  );
  const [showSamples, setShowSamples] = useState(initial?.rules.showSamples ?? true);
  const [strictMode, setStrictMode] = useState(initial?.rules.strictMode ?? false);
  const [scoring, setScoring] = useState(initial?.rules.scoring ?? "icpc");
  const [visibility, setVisibility] = useState(initial?.visibility ?? "PUBLIC");
  const [joinPolicy, setJoinPolicy] = useState(initial?.joinPolicy ?? "OPEN");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected.length) {
      setError("Select at least one problem.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    const data = new FormData(event.currentTarget);
    const startsAt = String(data.get("startsAt") || "");
    const endsAt = String(data.get("endsAt") || "");
    const payload = {
      title: String(data.get("title") || ""),
      description: String(data.get("description") || ""),
      durationMinutes: Number(data.get("durationMinutes") || 120),
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      problemIds: selected,
      visibility,
      joinPolicy,
      rules: {
        rulesVersion: 2,
        scoring,
        freezeMinutes: Number(data.get("freezeMinutes") || 0),
        penaltyPerWrong: Number(data.get("penaltyPerWrong") || 0),
        maxSubmissionsPerProblem: Number(data.get("maxSubmissionsPerProblem") || 0),
        publishAfterEnd,
        allowPracticeAfter: true,
        allowVirtual: true,
        showSamples,
        strictMode,
        languages: [],
        notes: String(data.get("notes") || ""),
      },
    };

    try {
      const editing = Boolean(initial?.id);
      const response = await fetch(editing ? `${apiBase}/${initial!.id}` : apiBase, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setError(result.message || "Could not save contest.");
        return;
      }
      if (editing) {
        setSuccess("Contest settings saved.");
        router.refresh();
      } else {
        router.push(`${apiBase.startsWith("/api/teacher") ? "/teacher" : "/admin"}/contests/${result.contest.id}`);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <EditorSection
        icon={FileText}
        title="Contest identity"
        description="Public title and instructions shown to participants."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block text-xs font-medium">
            Contest title
            <input
              name="title"
              required
              minLength={3}
              maxLength={120}
              defaultValue={initial?.title}
              placeholder="Fall 2026 Intra-University Contest"
              className={inputClass}
            />
          </label>
          <label className="block text-xs font-medium">
            Duration in minutes
            <input
              name="durationMinutes"
              type="number"
              required
              min={10}
              max={1440}
              defaultValue={initial?.durationMinutes ?? 120}
              className={inputClass}
            />
          </label>
        </div>
        <label className="mt-4 block text-xs font-medium">
          Description and participant instructions
          <textarea
            name="description"
            rows={5}
            maxLength={5000}
            defaultValue={initial?.description}
            placeholder="Eligibility, format, conduct rules, and useful context…"
            className={`${inputClass} resize-y`}
          />
        </label>
      </EditorSection>

      <EditorSection
        icon={CalendarClock}
        title="Schedule"
        description="Leave the start empty to keep this contest as a draft."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-xs font-medium">
            Scheduled start
            <input
              name="startsAt"
              type="datetime-local"
              defaultValue={initial?.startsAt}
              className={inputClass}
            />
          </label>
          <label className="block text-xs font-medium">
            Hard end time (optional)
            <input
              name="endsAt"
              type="datetime-local"
              defaultValue={initial?.endsAt}
              className={inputClass}
            />
          </label>
        </div>
      </EditorSection>

      <EditorSection
        icon={ShieldCheck}
        title="Access"
        description="Who can see this contest, and how they join it."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-xs font-medium">
            Visibility
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as ContestEditorValue["visibility"])}
              className={inputClass}
            >
              {VISIBILITY_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[10px] text-[var(--muted)]">
              {VISIBILITY_OPTIONS.find((o) => o.id === visibility)?.description}
            </span>
          </label>
          <label className="block text-xs font-medium">
            Join policy
            <select
              value={joinPolicy}
              onChange={(e) => setJoinPolicy(e.target.value as ContestEditorValue["joinPolicy"])}
              className={inputClass}
            >
              {JOIN_POLICY_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {(joinPolicy === "CODE" || joinPolicy === "PASSWORD") && (
          <p className="mt-3 rounded-lg border border-[var(--line)] bg-[var(--sunken)] p-3 text-[11px] text-[var(--muted)]">
            A join code is generated automatically once you save. Share it (and a
            password, if required) with participants — they redeem it at
            /contests/join.
          </p>
        )}
      </EditorSection>

      <EditorSection
        icon={Gavel}
        title="Scoring and controls"
        description="Choose how submissions turn into a rank, plus scoreboard freeze and submission limits."
      >
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Scoring engine</legend>
          {SCORING_OPTIONS.map((o) => (
            <label
              key={o.id}
              className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-xs ${
                scoring === o.id
                  ? "border-[var(--accent-dim)] bg-[var(--accent-surface)]"
                  : "border-[var(--line)] bg-[var(--sunken)]"
              }`}
            >
              <span className="flex items-center gap-2 font-semibold">
                <input
                  type="radio"
                  name="scoring"
                  checked={scoring === o.id}
                  onChange={() => setScoring(o.id)}
                  className="accent-[var(--accent)]"
                />
                {o.label}
              </span>
              <span className="text-[10px] text-[var(--muted)]">{o.description}</span>
            </label>
          ))}
        </fieldset>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <NumberField
            name="penaltyPerWrong"
            label="Penalty per wrong (min)"
            min={0}
            max={120}
            value={initial?.rules.penaltyPerWrong ?? 20}
          />
          <NumberField
            name="freezeMinutes"
            label="Scoreboard freeze (min)"
            min={0}
            max={600}
            value={initial?.rules.freezeMinutes ?? 60}
          />
          <NumberField
            name="maxSubmissionsPerProblem"
            label="Max attempts (0 = unlimited)"
            min={0}
            max={500}
            value={initial?.rules.maxSubmissionsPerProblem ?? 0}
          />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Toggle
            label="Show sample test cases"
            description="Participants can see sample input and output."
            checked={showSamples}
            onChange={setShowSamples}
          />
          <Toggle
            label="Publish after contest ends"
            description="Show final standings publicly. Published problems stay open for practice."
            checked={publishAfterEnd}
            onChange={setPublishAfterEnd}
          />
          <Toggle
            label="Strict mode"
            description="Single-session login, proctoring telemetry, and per-student problem variants."
            checked={strictMode}
            onChange={setStrictMode}
          />
        </div>
        <label className="mt-4 block text-xs font-medium">
          Additional rules
          <textarea
            name="notes"
            rows={3}
            maxLength={2000}
            defaultValue={initial?.rules.notes}
            placeholder="No internet, individual participation, clarification policy…"
            className={`${inputClass} resize-y`}
          />
        </label>
      </EditorSection>

      <EditorSection
        icon={Settings2}
        title="Problem set"
        description="Search the complete bank and arrange problems in contest order."
      >
        <ProblemSelector problems={problems} selected={selected} onChange={setSelected} />
      </EditorSection>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg-panel)]/95 p-3 shadow-2xl backdrop-blur mb-[env(safe-area-inset-bottom)]">
        <div aria-live="polite" className="min-h-5 min-w-0 flex-1 text-xs">
          {error && <span className="text-[var(--danger)]">{error}</span>}
          {success && (
            <span className="inline-flex items-center gap-1 text-[var(--accent)]">
              <Check size={13} aria-hidden="true" /> {success}
            </span>
          )}
          {!error && !success && (
            <span className="text-[var(--muted)]">
              {selected.length} problems · {SCORING_OPTIONS.find((o) => o.id === scoring)?.label} · draft until go-live
            </span>
          )}
        </div>
        <button
          type="submit"
          className="btn btn-primary shrink-0 !py-2 !text-xs"
          disabled={busy || selected.length === 0}
        >
          <Save size={14} aria-hidden="true" />
          {busy ? "Saving…" : initial?.id ? "Save" : "Create"}
        </button>
      </div>
    </form>
  );
}

function EditorSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof FileText;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--bg-panel)] p-4 sm:p-5">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--hover)] text-[var(--accent)]">
          <Icon size={16} aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-display text-base font-bold">{title}</h2>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function NumberField({
  name,
  label,
  min,
  max,
  value,
}: {
  name: string;
  label: string;
  min: number;
  max: number;
  value: number;
}) {
  return (
    <label className="block text-xs font-medium">
      {label}
      <input
        name={name}
        type="number"
        min={min}
        max={max}
        defaultValue={value}
        className={inputClass}
      />
    </label>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-[var(--line)] bg-[var(--sunken)] p-3">
      <span>
        <span className="block text-xs font-medium">{label}</span>
        <span className="mt-0.5 block text-[10px] text-[var(--muted)]">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-[var(--accent)]"
      />
    </label>
  );
}
