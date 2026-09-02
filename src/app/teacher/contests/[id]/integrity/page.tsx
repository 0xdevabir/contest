import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { contestCapabilities } from "@/lib/contest-access";
import { IntegrityConsole } from "@/components/integrity/IntegrityConsole";

type Props = { params: Promise<{ id: string }> };

export default async function ContestIntegrityPage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/teacher/contests/${id}/integrity`);

  const contest = await prisma.contest.findUnique({ where: { id } });
  if (!contest) notFound();

  const caps = await contestCapabilities(session, contest);
  if (!caps.has("edit")) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link
        href={`/teacher/contests/${id}`}
        className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft size={13} aria-hidden="true" />
        {contest.title}
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold">Academic integrity console</h1>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Ranked similarity pairs, proctor timelines, and dispositions. This surfaces candidates for review —
        it does not accuse anyone.
      </p>

      <div className="mt-6">
        <IntegrityConsole scopeType="contest" scopeId={id} contestId={id} />
      </div>
    </div>
  );
}
