"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DIFFICULTY_ORDER } from "@/lib/difficulty";

type Group = {
  id: string;
  order: number;
  name: string;
  points: number;
  isSample: boolean;
  cases: { id: string; order: number; label: string; inputBytes: number; expectedBytes: number; manualExpected: boolean }[];
};

type Reference = { id: string; language: string; expectedVerdict: string; lastVerdict: string | null };

type GateResult = {
  passed: boolean;
  blockers: string[];
  results: { referenceSolutionId: string; language: string; expectedVerdict: string; actualVerdict: string; passed: boolean; message?: string }[];
};

type Props = {
  problem: { id: string; slug: string; title: string; status: string; visibility: string; difficulty: string };
  version: {
    id: string;
    version: number;
    frozen: boolean;
    statementMd: string;
    inputSpec: string;
    outputSpec: string;
    constraints: string;
    timeLimitMs: number;
    memoryLimitMb: number;
    checkerType: string;
  };
  groups: Group[];
  references: Reference[];
};

type Tab = "statement" | "tests" | "solutions" | "settings" | "publish";

async function postJson(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}

export function ProblemEditor({ problem, version, groups, references }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("statement");
  const locked = version.frozen;

  async function fork() {
    const data = await postJson(`/api/teacher/problems/${problem.id}/versions`, "POST", {});
    if (data.ok) router.refresh();
    else alert(data.message ?? "Could not fork version");
  }

  return (
    <div className="mt-6">
      {locked ? (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-400">
          <span>This version is published and frozen. Fork it to make changes.</span>
          <button type="button" onClick={fork} className="btn btn-ghost !py-1 !text-[11px]">
            Fork new draft
          </button>
        </div>
      ) : null}

      <div className="flex gap-1 border-b border-[var(--line)]">
        {(["statement", "tests", "solutions", "settings", "publish"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-xs font-medium capitalize transition-colors ${
              tab === t ? "border-b-2 border-[var(--accent)] text-[var(--accent)]" : "text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "statement" && <StatementTab problemId={problem.id} version={version} locked={locked} />}
        {tab === "tests" && <TestsTab problemId={problem.id} versionId={version.id} groups={groups} locked={locked} />}
        {tab === "solutions" && <SolutionsTab problemId={problem.id} versionId={version.id} references={references} locked={locked} />}
        {tab === "settings" && <SettingsTab problem={problem} version={version} locked={locked} />}
        {tab === "publish" && <PublishTab problem={problem} versionId={version.id} />}
      </div>
    </div>
  );
}

function StatementTab({
  problemId,
  version,
  locked,
}: {
  problemId: string;
  version: Props["version"];
  locked: boolean;
}) {
  const [statementMd, setStatementMd] = useState(version.statementMd);
  const [inputSpec, setInputSpec] = useState(version.inputSpec);
  const [outputSpec, setOutputSpec] = useState(version.outputSpec);
  const [constraints, setConstraints] = useState(version.constraints);
  const [html, setHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      const res = await fetch("/api/teacher/statement-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: statementMd }),
      });
      const data = await res.json();
      if (data.ok) setHtml(data.html);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [statementMd]);

  async function save() {
    setSaving(true);
    setMessage(null);
    const data = await postJson(`/api/teacher/problems/${problemId}/versions/${version.id}`, "PATCH", {
      statementMd,
      inputSpec,
      outputSpec,
      constraints,
    });
    setMessage(data.ok ? "Saved." : (data.message ?? "Could not save"));
    setSaving(false);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <Field label="Statement (Markdown + $LaTeX$)">
          <textarea disabled={locked} value={statementMd} onChange={(e) => setStatementMd(e.target.value)} rows={12} className="field font-mono text-xs" />
        </Field>
        <Field label="Input format">
          <textarea disabled={locked} value={inputSpec} onChange={(e) => setInputSpec(e.target.value)} rows={2} className="field text-xs" />
        </Field>
        <Field label="Output format">
          <textarea disabled={locked} value={outputSpec} onChange={(e) => setOutputSpec(e.target.value)} rows={2} className="field text-xs" />
        </Field>
        <Field label="Constraints">
          <textarea disabled={locked} value={constraints} onChange={(e) => setConstraints(e.target.value)} rows={2} className="field text-xs" />
        </Field>
        {!locked && (
          <button type="button" onClick={save} disabled={saving} className="btn btn-primary !text-xs disabled:opacity-60">
            {saving ? "Saving…" : "Save statement"}
          </button>
        )}
        {message ? <p className="text-xs text-[var(--muted)]">{message}</p> : null}
      </div>
      <div>
        <p className="text-xs font-medium">Live preview</p>
        <div
          className="statement-prose mt-2 rounded-lg border border-[var(--line)] p-4 text-sm"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}

function TestsTab({
  problemId,
  versionId,
  groups,
  locked,
}: {
  problemId: string;
  versionId: string;
  groups: Group[];
  locked: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [newInput, setNewInput] = useState<Record<string, string>>({});
  const [newExpected, setNewExpected] = useState<Record<string, string>>({});
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupPoints, setNewGroupPoints] = useState(30);

  const addRow = useCallback(
    async (groupId: string) => {
      setBusy(true);
      const data = await postJson(`/api/teacher/problems/${problemId}/versions/${versionId}/tests`, "POST", {
        rows: [{ groupId, input: newInput[groupId] ?? "", expected: newExpected[groupId] ?? "" }],
      });
      setMessage(data.ok ? `Added ${data.created} test case(s).` : (data.message ?? "Could not add test"));
      setBusy(false);
      if (data.ok) router.refresh();
    },
    [problemId, versionId, newInput, newExpected, router]
  );

  const deleteCase = useCallback(
    async (caseId: string) => {
      if (!confirm("Delete this test case?")) return;
      const res = await fetch(`/api/teacher/problems/${problemId}/versions/${versionId}/tests/${caseId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) router.refresh();
      else alert(data.message ?? "Could not delete");
    },
    [problemId, versionId, router]
  );

  async function uploadZip(groupId: string, file: File) {
    setBusy(true);
    const form = new FormData();
    form.append("file", file);
    form.append("groupId", groupId);
    let res = await fetch(`/api/teacher/problems/${problemId}/versions/${versionId}/tests`, { method: "POST", body: form });
    let data = await res.json();
    if (data.ok && data.preview) {
      const proceed = confirm(
        `${data.validCount} valid case(s), ${data.errors.length} error(s):\n${data.errors
          .slice(0, 5)
          .map((e: { file: string; message: string }) => `${e.file}: ${e.message}`)
          .join("\n")}\n\nImport the valid ${data.validCount} case(s) anyway?`
      );
      if (!proceed) {
        setBusy(false);
        return;
      }
      const form2 = new FormData();
      form2.append("file", file);
      form2.append("groupId", groupId);
      form2.append("confirm", "true");
      res = await fetch(`/api/teacher/problems/${problemId}/versions/${versionId}/tests`, { method: "POST", body: form2 });
      data = await res.json();
    }
    setMessage(data.ok ? `Imported ${data.created} case(s).` : (data.message ?? "Zip upload failed"));
    setBusy(false);
    if (data.ok) router.refresh();
  }

  async function addGroup() {
    if (!newGroupName.trim()) return;
    const nextOrder = Math.max(...groups.map((g) => g.order), -1) + 1;
    const payload = {
      groups: [
        ...groups.map((g) => ({ order: g.order, name: g.name, points: g.points, isSample: g.isSample, dependsOn: [], stopOnFail: true })),
        { order: nextOrder, name: newGroupName.trim(), points: newGroupPoints, isSample: false, dependsOn: [], stopOnFail: true },
      ],
    };
    const data = await postJson(`/api/teacher/problems/${problemId}/versions/${versionId}/groups`, "POST", payload);
    if (data.ok) {
      setNewGroupName("");
      router.refresh();
    } else {
      alert(data.message ?? "Could not add group");
    }
  }

  return (
    <div className="space-y-6">
      {message ? <p className="text-xs text-[var(--muted)]">{message}</p> : null}
      {groups.map((g) => (
        <div key={g.id} className="rounded-xl border border-[var(--line)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <div>
              <p className="text-sm font-semibold">
                {g.name} {g.isSample ? <span className="ml-1 font-mono text-[10px] text-[var(--muted)]">SAMPLE</span> : null}
              </p>
              <p className="text-[11px] text-[var(--muted)]">
                {g.points} pts · {g.cases.length} case(s)
              </p>
            </div>
            {!locked && (
              <label className="btn btn-ghost !py-1 !text-[11px] cursor-pointer">
                Upload .zip
                <input
                  type="file"
                  accept=".zip"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadZip(g.id, file);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
          <ul className="divide-y divide-[var(--line-soft)]">
            {g.cases.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-4 py-2 text-xs">
                <span>
                  #{c.order + 1} {c.label ? `· ${c.label}` : ""} · {c.inputBytes}B in / {c.expectedBytes}B out
                </span>
                {!locked && (
                  <button type="button" onClick={() => deleteCase(c.id)} className="text-[var(--danger)] hover:underline">
                    Delete
                  </button>
                )}
              </li>
            ))}
            {g.cases.length === 0 ? <li className="px-4 py-4 text-xs text-[var(--muted)]">No cases yet.</li> : null}
          </ul>
          {!locked && (
            <div className="grid gap-2 border-t border-[var(--line)] p-3 sm:grid-cols-[1fr_1fr_auto]">
              <input
                placeholder="input"
                className="field !py-1.5 !text-xs font-mono"
                value={newInput[g.id] ?? ""}
                onChange={(e) => setNewInput((s) => ({ ...s, [g.id]: e.target.value }))}
              />
              <input
                placeholder="expected output"
                className="field !py-1.5 !text-xs font-mono"
                value={newExpected[g.id] ?? ""}
                onChange={(e) => setNewExpected((s) => ({ ...s, [g.id]: e.target.value }))}
              />
              <button type="button" disabled={busy} onClick={() => addRow(g.id)} className="btn btn-ghost !py-1.5 !text-xs">
                Add case
              </button>
            </div>
          )}
        </div>
      ))}

      {!locked && (
        <div className="rounded-xl border border-dashed border-[var(--line)] p-4">
          <p className="text-xs font-medium">Add a subtask group</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <input placeholder="Group name (e.g. subtask 1: n ≤ 100)" className="field !py-1.5 !text-xs" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} />
            <input type="number" min={0} max={100} className="field !py-1.5 !text-xs w-24" value={newGroupPoints} onChange={(e) => setNewGroupPoints(Number(e.target.value))} />
            <button type="button" onClick={addGroup} className="btn btn-ghost !py-1.5 !text-xs">
              Add group
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SolutionsTab({
  problemId,
  versionId,
  references,
  locked,
}: {
  problemId: string;
  versionId: string;
  references: Reference[];
  locked: boolean;
}) {
  const router = useRouter();
  const [source, setSource] = useState("");
  const [expectedVerdict, setExpectedVerdict] = useState("AC");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    const data = await postJson(`/api/teacher/problems/${problemId}/versions/${versionId}/references`, "POST", {
      language: "c",
      source,
      expectedVerdict,
    });
    setMessage(data.ok ? "Reference solution added." : (data.message ?? "Could not add"));
    setBusy(false);
    if (data.ok) {
      setSource("");
      router.refresh();
    }
  }

  return (
    <div className="space-y-5">
      <ul className="divide-y divide-[var(--line-soft)] rounded-xl border border-[var(--line)]">
        {references.map((r) => (
          <li key={r.id} className="flex items-center justify-between px-4 py-3 text-xs">
            <span className="font-mono">{r.language}</span>
            <span>expects {r.expectedVerdict}</span>
            <span className={r.lastVerdict === r.expectedVerdict ? "text-[var(--accent)]" : "text-[var(--muted)]"}>
              last: {r.lastVerdict ?? "not checked"}
            </span>
          </li>
        ))}
        {references.length === 0 ? <li className="px-4 py-6 text-xs text-[var(--muted)]">No reference solutions yet.</li> : null}
      </ul>

      {!locked && (
        <div className="rounded-xl border border-[var(--line)] p-4">
          <p className="text-xs font-medium">Add a reference solution (C)</p>
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            rows={8}
            placeholder="#include <stdio.h>\nint main() { ... }"
            className="field mt-2 font-mono text-xs"
          />
          <div className="mt-2 flex items-center gap-2">
            <select value={expectedVerdict} onChange={(e) => setExpectedVerdict(e.target.value)} className="field !py-1.5 !text-xs w-32">
              {["AC", "WA", "TLE", "MLE", "RE", "CE"].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            <button type="button" disabled={busy || !source.trim()} onClick={add} className="btn btn-primary !py-1.5 !text-xs disabled:opacity-60">
              Add solution
            </button>
          </div>
          {message ? <p className="mt-2 text-xs text-[var(--muted)]">{message}</p> : null}
        </div>
      )}
    </div>
  );
}

function SettingsTab({ problem, version, locked }: { problem: Props["problem"]; version: Props["version"]; locked: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState(problem.title);
  const [visibility, setVisibility] = useState(problem.visibility);
  const [difficulty, setDifficulty] = useState(problem.difficulty);
  const [timeLimitMs, setTimeLimitMs] = useState(version.timeLimitMs);
  const [memoryLimitMb, setMemoryLimitMb] = useState(version.memoryLimitMb);
  const [checkerType, setCheckerType] = useState(version.checkerType);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    const [metaRes, versionRes] = await Promise.all([
      postJson(`/api/teacher/problems/${problem.id}`, "PATCH", { title, visibility, difficulty }),
      locked ? Promise.resolve({ ok: true }) : postJson(`/api/teacher/problems/${problem.id}/versions/${version.id}`, "PATCH", { timeLimitMs, memoryLimitMb, checkerType }),
    ]);
    setMessage(metaRes.ok && versionRes.ok ? "Saved." : (metaRes.message ?? versionRes.message ?? "Could not save"));
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="max-w-lg space-y-4">
      <Field label="Title">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="field" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Difficulty">
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="field">
            {DIFFICULTY_ORDER.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Visibility">
          <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className="field">
            <option value="PRIVATE">Private</option>
            <option value="INSTITUTION">My institution</option>
            <option value="PUBLIC">Public archive</option>
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Time limit (ms)">
          <input disabled={locked} type="number" value={timeLimitMs} onChange={(e) => setTimeLimitMs(Number(e.target.value))} className="field" />
        </Field>
        <Field label="Memory (MB)">
          <input disabled={locked} type="number" value={memoryLimitMb} onChange={(e) => setMemoryLimitMb(Number(e.target.value))} className="field" />
        </Field>
        <Field label="Checker">
          <select disabled={locked} value={checkerType} onChange={(e) => setCheckerType(e.target.value)} className="field">
            <option value="TOKEN">Token</option>
            <option value="EXACT">Exact</option>
          </select>
        </Field>
      </div>
      <button type="button" disabled={busy} onClick={save} className="btn btn-primary !text-xs disabled:opacity-60">
        {busy ? "Saving…" : "Save settings"}
      </button>
      {message ? <p className="text-xs text-[var(--muted)]">{message}</p> : null}
    </div>
  );
}

function PublishTab({ problem, versionId }: { problem: Props["problem"]; versionId: string }) {
  const router = useRouter();
  const [gate, setGate] = useState<GateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function validate() {
    setBusy(true);
    const data = await postJson(`/api/teacher/problems/${problem.id}/versions/${versionId}/validate`, "POST", {});
    if (data.ok) setGate(data.gate);
    else setMessage(data.message ?? "Validation failed");
    setBusy(false);
  }

  async function submitReview() {
    setBusy(true);
    const data = await postJson(`/api/teacher/problems/${problem.id}/submit-review`, "POST", {});
    setMessage(data.ok ? "Submitted for review." : (data.message ?? "Could not submit"));
    setBusy(false);
    if (data.ok) router.refresh();
  }

  async function publish(force = false) {
    setBusy(true);
    const data = await postJson(`/api/teacher/problems/${problem.id}/versions/${versionId}/publish`, "POST", { force });
    if (data.ok) {
      setGate(data.gate);
      setMessage("Published! Visible in the public archive.");
      router.refresh();
    } else {
      setGate(data.gate ?? null);
      setMessage(data.message ?? "Publish blocked by the gate.");
    }
    setBusy(false);
  }

  return (
    <div className="max-w-xl space-y-5">
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={validate} className="btn btn-ghost !text-xs disabled:opacity-60">
          Validate
        </button>
        <button type="button" disabled={busy} onClick={() => publish(false)} className="btn btn-primary !text-xs disabled:opacity-60">
          Publish
        </button>
        {problem.status === "DRAFT" && (
          <button type="button" disabled={busy} onClick={submitReview} className="btn btn-ghost !text-xs disabled:opacity-60">
            Submit for review
          </button>
        )}
      </div>

      {message ? <p className="text-xs text-[var(--muted)]">{message}</p> : null}

      {gate ? (
        <div className={`rounded-xl border p-4 text-xs ${gate.passed ? "border-[var(--accent-dim)]" : "border-[var(--danger)]/40"}`}>
          <p className="font-semibold">{gate.passed ? "Gate passed" : "Gate failed"}</p>
          {gate.blockers.length > 0 && (
            <ul className="mt-2 list-disc pl-4 text-[var(--danger)]">
              {gate.blockers.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}
          <ul className="mt-3 space-y-1">
            {gate.results.map((r) => (
              <li key={r.referenceSolutionId} className={r.passed ? "text-[var(--accent)]" : "text-[var(--danger)]"}>
                {r.language} expects {r.expectedVerdict} → got {r.actualVerdict} {r.message ? `— ${r.message}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
