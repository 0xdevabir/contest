"use client";

import { useEffect, useState } from "react";
import { Copy, Users } from "lucide-react";

type Team = {
  id: string;
  name: string;
  joinCode: string;
  captainId: string;
  members: Array<{ userId: string; name: string; role: "CAPTAIN" | "MEMBER" }>;
};

/** D3 (docs/phases/PHASE-07-live-contest.md) — create/join a team, member list, join code. */
export function TeamPanel({ contestId, teamSize, viewerId }: { contestId: string; teamSize: number; viewerId: string | null }) {
  const [team, setTeam] = useState<Team | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = () => {
    fetch(`/api/contests/${contestId}/teams`)
      .then((r) => r.json())
      .then((d) => setTeam(d.ok ? d.team : null))
      .catch(() => setTeam(null));
  };

  useEffect(load, [contestId]);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/contests/${contestId}/teams`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const d = await res.json();
      if (!d.ok) {
        setError(d.message || "Could not create team");
        return;
      }
      load();
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/contests/${contestId}/teams/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ joinCode: code.trim() }),
      });
      const d = await res.json();
      if (!d.ok) {
        setError(d.message || "Could not join team");
        return;
      }
      load();
    } finally {
      setBusy(false);
    }
  }

  if (team === undefined) {
    return <div className="panel px-5 py-14 text-center text-sm text-[var(--muted)]">Loading…</div>;
  }

  if (team) {
    return (
      <div className="panel p-5">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-[var(--accent)]" aria-hidden="true" />
          <h2 className="font-display text-lg font-semibold">{team.name}</h2>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-[var(--muted)]">Join code</span>
          <code className="rounded bg-[var(--sunken)] px-2 py-1 font-mono text-sm tracking-wider">{team.joinCode}</code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(team.joinCode);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="btn btn-ghost !px-2 !py-1 !text-xs"
          >
            <Copy size={12} aria-hidden="true" />
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <ul className="mt-4 space-y-1.5">
          {team.members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between rounded-lg bg-[var(--sunken)] px-3 py-2 text-sm">
              <span>
                {m.name}
                {m.userId === viewerId && <span className="ml-1.5 font-mono text-[10px] text-[var(--accent)]">you</span>}
              </span>
              <span className="font-mono text-[10px] uppercase text-[var(--muted)]">{m.role}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 font-mono text-[11px] text-[var(--muted)]">
          {team.members.length}/{teamSize} teammates
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="panel p-5">
        <h2 className="font-display text-lg font-semibold">Create a team</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">You become the captain; share the join code with up to {teamSize - 1} teammates.</p>
        <div className="mt-3 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Team name"
            className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--sunken)] px-3 py-2 text-sm outline-none"
          />
          <button type="button" disabled={busy || !name.trim()} onClick={create} className="btn btn-primary">
            Create
          </button>
        </div>
      </div>
      <div className="panel p-5">
        <h2 className="font-display text-lg font-semibold">Join a team</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Enter the join code your captain shared.</p>
        <div className="mt-3 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="JOIN CODE"
            className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--sunken)] px-3 py-2 font-mono text-sm uppercase tracking-wider outline-none"
          />
          <button type="button" disabled={busy || !code.trim()} onClick={join} className="btn btn-primary">
            Join
          </button>
        </div>
      </div>
      {error && <p className="sm:col-span-2 text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
