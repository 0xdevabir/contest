"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RosterRowActions({
  sectionId,
  enrollmentId,
  role,
  status,
}: {
  sectionId: string;
  enrollmentId: string;
  role: "STUDENT" | "TA";
  status: "INVITED" | "ACTIVE" | "DROPPED";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setPending(true);
    await fetch(`/api/teacher/sections/${sectionId}/enrollments/${enrollmentId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setPending(false);
    router.refresh();
  }

  return (
    <div className="flex justify-end gap-2 text-[11px]">
      <button
        type="button"
        disabled={pending}
        onClick={() => void patch({ role: role === "TA" ? "STUDENT" : "TA" })}
        className="text-[var(--accent)] hover:underline"
      >
        {role === "TA" ? "Make student" : "Make TA"}
      </button>
      {status !== "DROPPED" ? (
        <button type="button" disabled={pending} onClick={() => void patch({ status: "DROPPED" })} className="text-[var(--danger)] hover:underline">
          Drop
        </button>
      ) : (
        <button type="button" disabled={pending} onClick={() => void patch({ status: "ACTIVE" })} className="text-[var(--accent)] hover:underline">
          Re-add
        </button>
      )}
    </div>
  );
}
