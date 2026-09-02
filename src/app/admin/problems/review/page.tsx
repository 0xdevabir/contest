import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { prismaDifficultyToLabel } from "@/lib/difficulty";
import { ReviewQueue } from "@/components/admin/ReviewQueue";

export default async function ProblemReviewQueuePage() {
  const problems = await prisma.problem.findMany({
    where: { status: "IN_REVIEW" },
    orderBy: { updatedAt: "asc" },
    include: {
      author: { select: { name: true, email: true } },
      versions: { orderBy: { version: "desc" }, take: 1, include: { references: true, groups: { select: { id: true } } } },
    },
  });

  const items = problems.map((p) => {
    const version = p.versions[0];
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      difficulty: prismaDifficultyToLabel(p.difficulty),
      authorName: p.author?.name ?? p.author?.email ?? "Unknown",
      version: version?.version ?? 1,
      groupCount: version?.groups.length ?? 0,
      referenceCount: version?.references.length ?? 0,
      passingReferences: version?.references.filter((r) => r.lastVerdict === r.expectedVerdict).length ?? 0,
    };
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-7 sm:px-6 lg:px-8">
      <Link href="/admin/problems" className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]">
        <ArrowLeft size={13} aria-hidden /> All problems
      </Link>
      <header className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">Setter review</p>
        <h1 className="mt-2 font-display text-3xl font-bold">Review queue</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {items.length} problem{items.length === 1 ? "" : "s"} awaiting approval before publish.
        </p>
      </header>

      <div className="mt-6">
        <ReviewQueue items={items} />
      </div>
    </div>
  );
}
