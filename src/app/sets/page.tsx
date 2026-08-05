import Link from "next/link";
import type { Metadata } from "next";
import { getMeta, getSets } from "@/lib/problems";
import { SetsIndexClient } from "@/components/SetsIndexClient";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "All 20 C Problem Sets — Curated curriculum from Very Easy to Extreme",
  description:
    "Browse 20 curated C programming problem sets from Very Easy to Extreme. Each set contains 7 problems that ramp in difficulty — a focused curriculum for C exam preparation and competitive programming.",
  keywords: [
    "C problem sets",
    "C programming curriculum",
    "C exam preparation",
    "competitive programming curriculum",
    "structured C practice",
  ],
  alternates: { canonical: "/sets" },
  openGraph: {
    title: "All 20 C Problem Sets — Curated curriculum from Very Easy to Extreme",
    description:
      "Browse 20 curated C programming problem sets from Very Easy to Extreme. Focused curriculum for C exam prep.",
    url: "/sets",
  },
  twitter: {
    title: "All 20 C Problem Sets — Curated curriculum",
    description:
      "20 curated C programming problem sets from Very Easy to Extreme.",
  },
};

export default function SetsPage() {
  const sets = getSets();
  const meta = getMeta();

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
      <PageHeader
        eyebrow="Problem bank"
        title={`All ${meta.sets} sets`}
        lead={
          <>
            {meta.sets} curriculum sets × {meta.problemsPerSet} questions (
            {meta.sets * meta.problemsPerSet} core problems). Browse all {meta.total} by
            difficulty on{" "}
            <Link
              href="/problems"
              className="text-[var(--accent)] underline-offset-2 hover:underline"
            >
              All problems
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
