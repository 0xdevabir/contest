"use client";

import { useState } from "react";
import { BookOpen, MessageSquare, Share2 } from "lucide-react";
import { EditorialView } from "./EditorialView";
import { CommentThread } from "./CommentThread";
import { SolutionsList } from "./SolutionsList";

type Tab = "editorial" | "discussion" | "solutions";

/** Additive surface below ProblemWorkspace (D-scope: "Tabs: Statement ·
 * Editorial · Discussion · Solutions, each server-gated"). The statement
 * itself stays inside ProblemWorkspace unchanged; this renders the other
 * three, each lazily mounted and gated by its own API call. */
export function ProblemCommunityTabs({
  problemId,
  currentUserId,
  currentUserRole,
}: {
  problemId: string;
  currentUserId: string | null;
  currentUserRole?: string;
}) {
  const [tab, setTab] = useState<Tab>("discussion");

  const tabs: { id: Tab; label: string; icon: typeof BookOpen }[] = [
    { id: "editorial", label: "Editorial", icon: BookOpen },
    { id: "discussion", label: "Discussion", icon: MessageSquare },
    { id: "solutions", label: "Solutions", icon: Share2 },
  ];

  return (
    <div className="mx-auto mt-6 max-w-[1500px] px-3 sm:px-6">
      <div role="tablist" aria-label="Community" className="flex gap-1 border-b border-[var(--line)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--text)]"
            }`}
          >
            <t.icon size={14} aria-hidden />
            {t.label}
          </button>
        ))}
      </div>

      <div className="panel mt-4 p-4 sm:p-5">
        {tab === "editorial" && <EditorialView problemId={problemId} />}
        {tab === "discussion" && (
          <CommentThread target="PROBLEM" targetId={problemId} currentUserId={currentUserId} currentUserRole={currentUserRole} />
        )}
        {tab === "solutions" && <SolutionsList problemId={problemId} />}
      </div>
    </div>
  );
}
