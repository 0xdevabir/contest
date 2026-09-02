import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { RejudgeDiff } from "@/components/admin/RejudgeDiff";

type Props = { params: Promise<{ id: string }> };

export default async function RejudgeBatchPage({ params }: Props) {
  const { id } = await params;
  const exists = await prisma.rejudgeBatch.findUnique({ where: { id }, select: { id: true } });
  if (!exists) notFound();

  return (
    <div className="mx-auto max-w-[1300px] px-4 py-7 sm:px-6 lg:px-8">
      <Link href="/admin/submissions" className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--text)]">
        <ArrowLeft size={13} aria-hidden />
        Back to submissions
      </Link>
      <header className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
          Rejudge
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold">Batch diff</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          A dry run judges into a shadow report without touching live verdicts until you apply it.
        </p>
      </header>

      <div className="mt-7">
        <RejudgeDiff batchId={id} />
      </div>
    </div>
  );
}
