"use client";

import { useEffect, useState } from "react";
import { Flag, MessageSquare, ThumbsDown, ThumbsUp } from "lucide-react";

type CommentTarget = "PROBLEM" | "CONTEST" | "EDITORIAL" | "ANNOUNCEMENT";

type CommentRow = {
  id: string;
  parentId: string | null;
  userId: string;
  authorName: string;
  body: string | null;
  bodyHtml: string | null;
  spoiler: boolean;
  gated: boolean;
  reason?: string;
  score: number;
  editedAt: string | null;
  createdAt: string;
  replies?: CommentRow[];
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  return res.json();
}

function CommentRowView({
  comment,
  currentUserId,
  onReveal,
  onVote,
  onReport,
  isReply = false,
}: {
  comment: CommentRow;
  currentUserId: string | null;
  isReply?: boolean;
  onReveal: (id: string) => void;
  onVote: (id: string, value: 1 | -1 | 0) => void;
  onReport: (id: string) => void;
}) {
  return (
    <div className={`py-3 ${isReply ? "ml-6 border-l border-[var(--line)] pl-4" : ""}`}>
      <div className="flex items-baseline gap-2 text-xs text-[var(--muted)]">
        <span className="font-medium text-[var(--text)]">{comment.authorName}</span>
        <span>{timeAgo(comment.createdAt)}</span>
        {comment.editedAt ? <span className="text-[var(--muted-dim)]">(edited)</span> : null}
      </div>

      {comment.gated ? (
        <div className="mt-2 rounded-lg border border-[var(--warn)]/30 bg-[var(--warn-surface)] p-3 text-xs">
          <p className="text-[var(--warn)]">{comment.reason ?? "This comment contains a spoiler."}</p>
          <button
            type="button"
            onClick={() => onReveal(comment.id)}
            className="btn btn-ghost !mt-2 !py-1.5 !text-[11px]"
          >
            Show spoiler anyway
          </button>
        </div>
      ) : (
        <div
          className="prose prose-sm mt-1.5 max-w-none text-sm text-[var(--text)]"
          dangerouslySetInnerHTML={{ __html: comment.bodyHtml ?? "" }}
        />
      )}

      <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--muted)]">
        <button type="button" onClick={() => onVote(comment.id, 1)} className="inline-flex items-center gap-1 hover:text-[var(--accent)]">
          <ThumbsUp size={12} aria-hidden />
        </button>
        <span className="tnum font-mono">{comment.score}</span>
        <button type="button" onClick={() => onVote(comment.id, -1)} className="inline-flex items-center gap-1 hover:text-[var(--danger)]">
          <ThumbsDown size={12} aria-hidden />
        </button>
        {currentUserId ? (
          <button type="button" onClick={() => onReport(comment.id)} className="ml-auto inline-flex items-center gap-1 hover:text-[var(--text)]">
            <Flag size={12} aria-hidden />
            Report
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function CommentThread({
  target,
  targetId,
  currentUserId,
  currentUserRole,
}: {
  target: CommentTarget;
  targetId: string;
  currentUserId: string | null;
  currentUserRole?: string;
}) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const data = await api<{ ok: boolean; comments: CommentRow[] }>(
      `/api/comments?target=${target}&targetId=${encodeURIComponent(targetId)}`
    );
    if (data.ok) setComments(data.comments);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, targetId]);

  async function reveal() {
    const data = await api<{ ok: boolean; comments: CommentRow[] }>(
      `/api/comments?target=${target}&targetId=${encodeURIComponent(targetId)}&reveal=1`
    );
    if (data.ok) setComments(data.comments);
  }

  async function vote(id: string, value: 1 | -1 | 0) {
    if (!currentUserId) return;
    await api(`/api/comments/${id}/vote`, { method: "POST", body: JSON.stringify({ value }) });
    void load();
  }

  async function report(id: string) {
    const reason = window.prompt("Why are you reporting this comment?");
    if (!reason) return;
    await api("/api/reports", { method: "POST", body: JSON.stringify({ target: "comment", targetId: id, reason }) });
  }

  async function submit(body: string, parentId: string | null, clear: () => void) {
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    const res = await api<{ ok: boolean; message?: string }>("/api/comments", {
      method: "POST",
      body: JSON.stringify({ target, targetId, parentId: parentId ?? undefined, body, spoiler: parentId ? false : spoiler }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message ?? "Could not post that comment.");
      return;
    }
    clear();
    void load();
  }

  return (
    <div id="comments">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <MessageSquare size={15} aria-hidden />
        Discussion
      </h3>

      {currentUserId ? (
        <div className="panel p-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Share your thoughts, ask a question — Markdown supported."
            rows={3}
            className="w-full resize-y rounded-lg border border-[var(--line)] bg-[var(--bg)] p-2.5 text-sm outline-none focus:border-[var(--accent-border)]"
          />
          <div className="mt-2 flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <input type="checkbox" checked={spoiler} onChange={(e) => setSpoiler(e.target.checked)} />
              Contains a spoiler
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => submit(draft, null, () => setDraft(""))}
              className="btn btn-primary !py-1.5 !text-xs"
            >
              Post
            </button>
          </div>
          {error ? <p className="mt-2 text-xs text-[var(--danger)]">{error}</p> : null}
        </div>
      ) : (
        <p className="text-xs text-[var(--muted)]">
          <a href="/login" className="text-[var(--accent)] hover:underline">
            Sign in
          </a>{" "}
          to join the discussion.
        </p>
      )}

      <div className="mt-4 divide-y divide-[var(--line)]">
        {loading ? (
          <p className="py-6 text-center text-xs text-[var(--muted)]">Loading…</p>
        ) : comments.length === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--muted)]">No comments yet — be the first.</p>
        ) : (
          comments.map((c) => (
            <div key={c.id}>
              <CommentRowView comment={c} currentUserId={currentUserId} onReveal={reveal} onVote={vote} onReport={report} />
              {currentUserId ? (
                <button
                  type="button"
                  onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}
                  className="ml-0 text-[11px] text-[var(--muted)] hover:text-[var(--accent)]"
                >
                  Reply
                </button>
              ) : null}
              {replyTo === c.id ? (
                <div className="mt-2 ml-6">
                  <textarea
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    rows={2}
                    className="w-full resize-y rounded-lg border border-[var(--line)] bg-[var(--bg)] p-2 text-sm outline-none focus:border-[var(--accent-border)]"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => submit(replyDraft, c.id, () => { setReplyDraft(""); setReplyTo(null); })}
                    className="btn btn-ghost !mt-1.5 !py-1.5 !text-[11px]"
                  >
                    Post reply
                  </button>
                </div>
              ) : null}
              {(c.replies ?? []).map((r) => (
                <CommentRowView key={r.id} comment={r} currentUserId={currentUserId} onReveal={reveal} onVote={vote} onReport={report} isReply />
              ))}
            </div>
          ))
        )}
      </div>

      {currentUserRole === "ADMIN" ? (
        <p className="mt-3 font-mono text-[10px] text-[var(--muted-dim)]">
          Moderation: <a href="/admin/moderation" className="hover:text-[var(--text)]">review reported content</a>
        </p>
      ) : null}
    </div>
  );
}
