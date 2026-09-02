"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Megaphone, MessageCircleQuestion, Send, ShieldQuestion } from "lucide-react";

type Announcement = { id: string; title: string; body: string; problemId: string | null; createdAt: string };
type Clarification = {
  id: string;
  problemId: string | null;
  question: string;
  answer: string | null;
  status: "OPEN" | "ANSWERED" | "PROMOTED" | "CLOSED";
  createdAt: string;
};

/**
 * D1 (docs/phases/PHASE-07-live-contest.md) — the announcements feed plus
 * "ask a question" plus the caller's own clarification threads, all in one
 * panel with unread badges. Lives beside the main dashboard content, not in
 * a tab, since it's the one thing a contestant needs to glance at without
 * losing their place in the problem list or standings.
 */
export function ContestSidebar({
  contestId,
  loggedIn,
  canAsk,
  liveEnabled,
  problems,
  isStaff = false,
}: {
  contestId: string;
  loggedIn: boolean;
  canAsk: boolean;
  liveEnabled: boolean;
  problems: Array<{ problemId: string; label: string }>;
  isStaff?: boolean;
}) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [threads, setThreads] = useState<Clarification[]>([]);
  const [seenCount, setSeenCount] = useState(0);
  const [question, setQuestion] = useState("");
  const [problemId, setProblemId] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"announcements" | "mine">("announcements");

  const labelOf = useMemo(() => new Map(problems.map((p) => [p.problemId, p.label])), [problems]);

  useEffect(() => {
    fetch(`/api/contests/${contestId}/announcements`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setAnnouncements(d.announcements);
      })
      .catch(() => undefined);

    if (loggedIn) {
      fetch(`/api/contests/${contestId}/clarifications`)
        .then((r) => r.json())
        .then((d) => {
          if (d.ok) setThreads(d.clarifications);
        })
        .catch(() => undefined);
    }
  }, [contestId, loggedIn]);

  useEffect(() => {
    if (!liveEnabled) return;
    const es = new EventSource(`/api/contests/${contestId}/stream`);
    es.addEventListener("announcement", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as Announcement;
      setAnnouncements((prev) => [data, ...prev.filter((a) => a.id !== data.id)]);
    });
    es.addEventListener("clarification", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { id: string; status: Clarification["status"]; answer?: string | null };
      setThreads((prev) => prev.map((t) => (t.id === data.id ? { ...t, status: data.status, answer: data.answer ?? t.answer } : t)));
    });
    return () => es.close();
  }, [liveEnabled, contestId]);

  const unread = announcements.length - seenCount;

  async function ask() {
    if (!question.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/contests/${contestId}/clarifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim(), problemId: problemId || undefined }),
      });
      const d = await res.json();
      if (!d.ok) {
        setError(d.message || "Could not send your question");
        return;
      }
      setThreads((prev) => [d.clarification, ...prev]);
      setQuestion("");
      setView("mine");
    } catch {
      setError("Network error — try again");
    } finally {
      setSending(false);
    }
  }

  return (
    <aside className="panel flex max-h-[32rem] flex-col overflow-hidden lg:sticky lg:top-[calc(3.25rem+0.5rem)]">
      {isStaff && (
        <Link
          href={`/teacher/contests/${contestId}/integrity`}
          className="flex items-center gap-1.5 border-b border-[var(--line)] px-3 py-2 text-xs font-medium text-[var(--muted)] hover:text-[var(--text)]"
        >
          <ShieldQuestion size={13} aria-hidden="true" />
          Academic integrity console
        </Link>
      )}
      <div className="flex border-b border-[var(--line)]">
        <button
          type="button"
          onClick={() => {
            setView("announcements");
            setSeenCount(announcements.length);
          }}
          className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium ${
            view === "announcements" ? "border-b-2 border-[var(--accent)] text-[var(--text)]" : "text-[var(--muted)]"
          }`}
        >
          <Megaphone size={13} aria-hidden="true" />
          Announcements
          {unread > 0 && (
            <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--accent-contrast)]">
              {unread}
            </span>
          )}
        </button>
        {loggedIn && (
          <button
            type="button"
            onClick={() => setView("mine")}
            className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium ${
              view === "mine" ? "border-b-2 border-[var(--accent)] text-[var(--text)]" : "text-[var(--muted)]"
            }`}
          >
            <MessageCircleQuestion size={13} aria-hidden="true" />
            My questions
            {threads.length > 0 && (
              <span className="font-mono text-[9px] text-[var(--muted)]">{threads.length}</span>
            )}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {view === "announcements" ? (
          announcements.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-[var(--muted)]">No announcements yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {announcements.map((a) => (
                <li key={a.id} className="rounded-lg border border-[var(--line)] bg-[var(--sunken)] p-2.5">
                  {a.title && <p className="text-xs font-semibold">{a.title}</p>}
                  <p className="mt-0.5 whitespace-pre-wrap text-xs text-[var(--muted)]">{a.body}</p>
                  {a.problemId && (
                    <span className="mt-1 inline-block font-mono text-[10px] text-[var(--accent)]">
                      {labelOf.get(a.problemId) ?? a.problemId}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )
        ) : threads.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-[var(--muted)]">You haven&apos;t asked anything yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {threads.map((t) => (
              <li key={t.id} className="rounded-lg border border-[var(--line)] bg-[var(--sunken)] p-2.5">
                <p className="text-xs font-medium">{t.question}</p>
                {t.problemId && (
                  <span className="font-mono text-[10px] text-[var(--accent)]">{labelOf.get(t.problemId) ?? t.problemId}</span>
                )}
                <p className="mt-1 text-[10px] uppercase tracking-wide text-[var(--muted)]">{t.status}</p>
                {t.answer && <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--text)]">{t.answer}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {loggedIn && canAsk && (
        <div className="border-t border-[var(--line)] p-2.5">
          {problems.length > 0 && (
            <select
              value={problemId}
              onChange={(e) => setProblemId(e.target.value)}
              className="mb-1.5 w-full rounded-lg border border-[var(--line)] bg-[var(--sunken)] px-2 py-1.5 text-xs outline-none"
            >
              <option value="">General question</option>
              {problems.map((p) => (
                <option key={p.problemId} value={p.problemId}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-1.5">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && ask()}
              placeholder="Ask a question…"
              className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--sunken)] px-2.5 py-1.5 text-xs outline-none focus:border-[var(--accent-border)]"
            />
            <button
              type="button"
              onClick={ask}
              disabled={sending || !question.trim()}
              className="btn btn-primary !px-2.5 !py-1.5"
              aria-label="Send question"
            >
              <Send size={13} aria-hidden="true" />
            </button>
          </div>
          {error && <p className="mt-1 text-[11px] text-[var(--danger)]">{error}</p>}
        </div>
      )}
    </aside>
  );
}
