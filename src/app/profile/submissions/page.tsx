import Link from "next/link";
import { redirect } from "next/navigation";
import type { Verdict } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { getUserSubmissions } from "@/lib/profile";
import { difficultyClass } from "@/lib/difficulty";
import { PageHeader } from "@/components/PageHeader";
import type { Difficulty } from "@/lib/types";

function tone(v: Verdict) {
  if (v === "AC") return "text-[var(--accent)]";
  if (v === "WA" || v === "RE" || v === "ERROR") return "text-[var(--danger)]";
  if (v === "TLE" || v === "MLE" || v === "CE") return "text-[var(--warn)]";
  return "text-[var(--muted)]";
}

type Props = { searchParams: Promise<{ page?: string }> };

export default async function ProfileSubmissionsPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect("/login?next=/profile/submissions");

  const { page: pageRaw } = await searchParams;
  const page = Math.max(1, Number(pageRaw) || 1);
  const take = 40;
  const { items, total } = await getUserSubmissions(session.id, {
    take,
    skip: (page - 1) * take,
  });
  const pages = Math.max(1, Math.ceil(total / take));

  return (
    <div>
      <PageHeader
        eyebrow="History"
        title="Submissions"
        lead={`${total} judged run${total === 1 ? "" : "s"} saved against your account.`}
      />

      <div className="panel mt-8 overflow-hidden">
        {items.length === 0 ? (
          <p className="px-5 py-10 text-sm text-[var(--muted)]">
            No submissions yet.{" "}
            <Link href="/problems" className="text-[var(--accent)] hover:underline">
              Start practicing
            </Link>
            .
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[var(--line)] font-mono text-[10px] uppercase tracking-wide text-[var(--muted-dim)]">
                <tr>
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Problem</th>
                  <th className="px-4 py-3 font-medium">Verdict</th>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Context</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {items.map((row) => (
                  <tr key={row.id} className="hover:bg-white/[0.015]">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-[var(--muted)]">
                      {row.createdAt.toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/problems/${row.problemId}`}
                        className="font-medium hover:text-[var(--accent)]"
                      >
                        {row.title}
                      </Link>
                      {row.difficulty ? (
                        <p
                          className={`mt-0.5 font-mono text-[10px] uppercase ${difficultyClass(row.difficulty as Difficulty)}`}
                        >
                          {row.difficulty}
                        </p>
                      ) : null}
                    </td>
                    <td className={`px-4 py-3 font-mono text-xs font-semibold ${tone(row.verdict)}`}>
                      {row.verdict}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[var(--muted)]">
                      {row.timeMs != null ? `${row.timeMs} ms` : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--muted)]">
                      {row.contest ? (
                        <Link
                          href={`/contests/${row.contest.slug}`}
                          className="hover:text-[var(--accent)]"
                        >
                          {row.contest.title}
                        </Link>
                      ) : (
                        "Practice"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link
              href={`/profile/submissions?page=${page - 1}`}
              className="btn btn-ghost !py-2 !text-xs"
            >
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="font-mono text-[11px] text-[var(--muted-dim)]">
            Page {page} / {pages}
          </span>
          {page < pages ? (
            <Link
              href={`/profile/submissions?page=${page + 1}`}
              className="btn btn-ghost !py-2 !text-xs"
            >
              Next
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </div>
  );
}
