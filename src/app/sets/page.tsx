import Link from "next/link";
import type { Metadata } from "next";
import { getMeta, getSets } from "@/lib/problems";
import { SetsIndexClient } from "@/components/SetsIndexClient";
import { PageHeader } from "@/components/PageHeader";
import { breadcrumbJsonLd, buildPageMetadata, JsonLd } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "All 20 C Problem Sets — Curriculum from Very Easy to Extreme",
  description:
    "Browse 20 curated C programming problem sets from Very Easy to Extreme. Each set has 7 exam-style problems — a focused curriculum for C lab exam prep and competitive programming practice in Bangladesh.",
  path: "/sets",
  keywords: [
    "C problem sets",
    "C programming curriculum",
    "C exam preparation",
    "structured C practice",
    "C lab exam sets",
  ],
});

export default function SetsPage() {
  const sets = getSets();
  const meta = getMeta();

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Sets", path: "/sets" },
        ])}
      />
      <PageHeader
        eyebrow="C problem bank"
        title={`All ${meta.sets} C programming sets`}
        lead={
          <>
            {meta.sets} curriculum sets × {meta.problemsPerSet} questions (
            {meta.sets * meta.problemsPerSet} core problems). Browse all {meta.total} by
            difficulty on{" "}
            <Link href="/problems" className="text-[var(--accent)] hover:underline">
              the problems index
            </Link>
            .
          </>
        }
      />
      <SetsIndexClient
        sets={sets.map((s) => ({
          set: s.set,
          title: s.title,
          problems: s.problems,
        }))}
      />
    </div>
  );
}
