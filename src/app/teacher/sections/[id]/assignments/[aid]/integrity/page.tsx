import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertSectionStaff } from "@/lib/section-access";
import { AuthError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { IntegrityConsole } from "@/components/integrity/IntegrityConsole";

type Props = { params: Promise<{ id: string; aid: string }> };

export default async function AssignmentIntegrityPage({ params }: Props) {
  const { id, aid } = await params;
  const session = await getSession();
  if (!session) redirect(`/login?next=/teacher/sections/${id}/assignments/${aid}/integrity`);

  try {
    await assertSectionStaff(session, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    if (err instanceof ForbiddenError || err instanceof AuthError) redirect("/teacher/sections");
    throw err;
  }

  const assignment = await prisma.assignment.findUnique({ where: { id: aid }, select: { id: true, title: true, sectionId: true } });
  if (!assignment || assignment.sectionId !== id) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link
        href={`/teacher/sections/${id}/assignments/${aid}`}
        className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]"
      >
        <ArrowLeft size={13} aria-hidden="true" />
        {assignment.title}
      </Link>

      <h1 className="mt-3 font-display text-2xl font-bold">Academic integrity console</h1>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Ranked similarity pairs and dispositions for this assignment. This surfaces candidates for
        review — it does not accuse anyone.
      </p>

      <div className="mt-6">
        <IntegrityConsole scopeType="assignment" scopeId={aid} />
      </div>
    </div>
  );
}
