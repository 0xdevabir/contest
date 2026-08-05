"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, FileText, Gavel, Save, Settings2 } from "lucide-react";
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
  rules: {
    freezeMinutes: number;
    penaltyPerWrong: number;
    maxSubmissionsPerProblem: number;
    allowPracticeAfter: boolean;
    showSamples: boolean;
    notes: string;
  };
};

const inputClass =
  "mt-1.5 w-full rounded-lg border border-[var(--line)] bg-[#0a0f16] px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-[var(--muted)]/60 focus:border-[var(--accent-dim)]";

export function ContestEditor({
  problems,
  initial,
}: {
  problems: AdminProblemOption[];
  initial?: ContestEditorValue;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(
    initial?.problemIds ?? ["set1-q1", "set1-q2", "set1-q3"]
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [allowPracticeAfter, setAllowPracticeAfter] = useState(
    initial?.rules.allowPracticeAfter ?? true
  );
  const [showSamples, setShowSamples] = useState(initial?.rules.showSamples ?? true);

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
      rules: {
        freezeMinutes: Number(data.get("freezeMinutes") || 0),
        penaltyPerWrong: Number(data.get("penaltyPerWrong") || 0),
        maxSubmissionsPerProblem: Number(data.get("maxSubmissionsPerProblem") || 0),
        allowPracticeAfter,
        showSamples,
        languages: ["c"],
        notes: String(data.get("notes") || ""),
      },
    };

    try {
      const editing = Boolean(initial?.id);
      const response = await fetch(
        editing ? `/api/admin/contests/${initial!.id}` : "/api/admin/contests",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setError(result.message || "Could not save contest.");
        return;
      }
      if (editing) {
        setSuccess("Contest settings saved.");
        router.refresh();
      } else {
        router.push(`/admin/contests/${result.contest.id}`);
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
        icon={Gavel}
        title="Scoring and controls"
        description="ICPC-style penalty defaults, scoreboard freeze, and submission limits."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <NumberField
            name="penaltyPerWrong"
            label="Penalty per wrong (min)"
            min={0}
            max={60}
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
            label="Allow practice after contest"
            description="Contest problems remain available after ending."
            checked={allowPracticeAfter}
            onChange={setAllowPracticeAfter}
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

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[#111821]/95 p-3 shadow-2xl backdrop-blur">
        <div aria-live="polite" className="min-h-5 text-xs">
          {error && <span className="text-[var(--danger)]">{error}</span>}
          {success && (
            <span className="inline-flex items-center gap-1 text-[var(--accent)]">
              <Check size={13} aria-hidden="true" /> {success}
            </span>
          )}
          {!error && !success && (
            <span className="text-[var(--muted)]">
              {selected.length} problems · C language · changes stay draft until go-live
            </span>
          )}
        </div>
        <button
          type="submit"
          className="btn btn-primary !py-2 !text-xs"
          disabled={busy || selected.length === 0}
        >
          <Save size={14} aria-hidden="true" />
          {busy ? "Saving…" : initial?.id ? "Save changes" : "Create contest"}
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
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-[var(--accent)]">
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
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-[var(--line)] bg-black/15 p-3">
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
