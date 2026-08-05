import type { Metadata } from "next";
import { CategoriesIndexClient } from "@/components/CategoriesIndexClient";
import { PageHeader } from "@/components/PageHeader";
import { getCategories, getMeta } from "@/lib/problems";

export const metadata: Metadata = {
  title: "All C Programming Problems — 700 exam-style problems across 7 difficulty tiers",
  description:
    "Browse 700 free C programming problems across 7 difficulty tiers (Very Easy, Easy, Medium, Medium-Hard, Hard, Very Hard, Extreme). Each problem runs against hidden tests in our instant online judge. No login required to practice.",
  keywords: [
    "C practice problems",
    "C programming problems by difficulty",
    "online judge problems",
    "exam-style C questions",
    "competitive programming problems",
    "C coding problems for beginners",
    "C problem bank",
  ],
  alternates: { canonical: "/problems" },
  openGraph: {
    title: "All C Programming Problems — 700 exam-style problems",
    description:
      "Browse 700 free C programming problems across 7 difficulty tiers. Instant judge, no login required.",
    url: "/problems",
  },
  twitter: {
    title: "All C Programming Problems — 700 exam-style problems",
    description:
      "Browse 700 free C programming problems across 7 difficulty tiers. Instant judge, no login required.",
  },
};

export default function ProblemsPage() {
  const categories = getCategories();
  const meta = getMeta();

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
      <PageHeader
        eyebrow="Always-open practice"
        title={`All ${meta.total} problems`}
        lead={`Browse by difficulty category — ${meta.tiers?.length ?? 7} tiers, ${
          meta.problemsPerTier ?? 100
        } problems each. Core authored problems are marked; generated extras fill each tier for volume practice.`}
      />
      <CategoriesIndexClient categories={categories} />
    </div>
  );
}
