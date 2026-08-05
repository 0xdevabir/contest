import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSets } from "@/lib/problems";
import { ProblemList } from "@/components/ProblemList";
import { PageHeader } from "@/components/PageHeader";

type Props = { params: Promise<{ set: string }> };

export function generateStaticParams() {
  return Array.from({ length: 20 }, (_, i) => ({ set: String(i + 1) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { set: setParam } = await params;
  const setNum = Number(setParam);
  const set = getSets().find((s) => s.set === setNum);
  if (!set) {
    return {
      title: "Set not found",
      robots: { index: false, follow: false },
    };
  }
  const description =
    `Set ${set.set}: ${set.title}. ` +
    `Seven C programming problems ramping from Very Easy to Extreme. ` +
    `Solve, run against hidden tests, and grade instantly.`;
  return {
    title: `Set ${String(set.set).padStart(2, "0")} — ${set.title} | 7 C problems`,
    description,
    keywords: [
      `C problem set ${set.set}`,
      `${set.title} C problems`,
      "C programming practice set",
    ],
    alternates: { canonical: `/sets/${setNum}` },
    openGraph: {
      title: `Set ${String(set.set).padStart(2, "0")} — ${set.title}`,
      description,
      url: `/sets/${setNum}`,
    },
    twitter: {
      title: `Set ${String(set.set).padStart(2, "0")} — ${set.title}`,
      description,
    },
  };
}

export default async function SetDetailPage({ params }: Props) {
  const { set: setParam } = await params;
  const setNum = Number(setParam);
  const set = getSets().find((s) => s.set === setNum);
  if (!set) notFound();

  const prev = setNum > 1 ? setNum - 1 : null;
  const next = setNum < 20 ? setNum + 1 : null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
      <nav className="mb-7 flex flex-wrap items-center gap-2 font-mono text-xs text-[var(--muted-dim)]">
        <Link href="/sets" className="transition-colors hover:text-[var(--text)]">
          Sets
        </Link>
        <span aria-hidden>/</span>
        <span className="text-[var(--muted)]">Set {set.set}</span>
      </nav>

      <PageHeader
        eyebrow={`Set ${String(set.set).padStart(2, "0")}`}
        title={set.title}
        lead="Seven problems, ramping from Very Easy to Extreme."
      />

      <div className="mt-8">
        <ProblemList problems={set.problems} />
      </div>

      <div className="mt-8 flex justify-between">
        {prev ? (
          <Link href={`/sets/${prev}`} className="btn btn-ghost">
            ← Set {prev}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/sets/${next}`} className="btn btn-ghost">
            Set {next} →
          </Link>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}


