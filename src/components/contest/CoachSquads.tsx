"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";

type Squad = {
  id: string;
  name: string;
  joinCode: string;
  members: Array<{ userId: string; name: string; role: string }>;
  history: Array<{ contestId: string; title: string; slug: string; status: string; endsAt: string | null }>;
};

export function CoachSquads() {
  const [squads, setSquads] = useState<Squad[] | null>(null);

  useEffect(() => {
    fetch("/api/coach/squads")
      .then((r) => r.json())
      .then((d) => setSquads(d.ok ? d.squads : []))
      .catch(() => setSquads([]));
  }, []);

  if (squads === null) return <p className="text-sm text-[var(--muted)]">Loading…</p>;
  if (squads.length === 0) {
    return (
      <div className="panel px-5 py-14 text-center">
        <Users size={24} className="mx-auto text-[var(--muted)]" aria-hidden="true" />
        <p className="mt-3 text-sm text-[var(--muted)]">No persistent squads yet.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {squads.map((squad) => (
        <li key={squad.id} className="panel p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold">{squad.name}</h2>
            <code className="rounded bg-[var(--sunken)] px-2 py-1 font-mono text-xs tracking-wider">{squad.joinCode}</code>
          </div>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {squad.members.map((m) => (
              <li key={m.userId} className="rounded-lg bg-[var(--sunken)] px-2.5 py-1 text-xs">
                {m.name}
              </li>
            ))}
          </ul>
          {squad.history.length > 0 && (
            <div className="mt-4 border-t border-[var(--line)] pt-3">
              <p className="eyebrow">Recent contests</p>
              <ul className="mt-2 space-y-1.5">
                {squad.history.map((h) => (
                  <li key={`${h.contestId}`} className="flex items-center justify-between text-sm">
                    <Link href={`/contests/${h.slug}`} className="link-quiet truncate">
                      {h.title}
                    </Link>
                    <span className="font-mono text-[10px] uppercase text-[var(--muted)]">{h.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
