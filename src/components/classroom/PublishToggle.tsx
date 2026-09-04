"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PublishToggle({
  assignmentId,
  published,
  canManage = true,
}: {
  assignmentId: string;
  published: boolean;
  canManage?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    await fetch(`/api/teacher/assignments/${assignmentId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ published: !published }),
    });
    setPending(false);
    router.refresh();
  }

  const badgeCls = `rounded border px-1.5 py-0.5 font-mono text-[9px] ${
    published ? "border-[var(--accent-dim)] text-[var(--accent)]" : "border-[var(--line)] text-[var(--muted)]"
  }`;

  // Publishing is teacher-only (assertSectionTeacher) — a TA gets a
  // read-only status badge instead of a button that would just 403.
  if (!canManage) {
    return <span className={badgeCls}>{published ? "PUBLISHED" : "DRAFT"}</span>;
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        void toggle();
      }}
      className={badgeCls}
    >
      {published ? "PUBLISHED" : "DRAFT"}
    </button>
  );
}
