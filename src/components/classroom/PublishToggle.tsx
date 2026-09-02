"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PublishToggle({ assignmentId, published }: { assignmentId: string; published: boolean }) {
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

  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        void toggle();
      }}
      className={`rounded border px-1.5 py-0.5 font-mono text-[9px] ${
        published ? "border-[var(--accent-dim)] text-[var(--accent)]" : "border-[var(--line)] text-[var(--muted)]"
      }`}
    >
      {published ? "PUBLISHED" : "DRAFT"}
    </button>
  );
}
