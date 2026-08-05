import { Suspense } from "react";
import type { Metadata } from "next";
import { CategoriesIndexClient } from "@/components/CategoriesIndexClient";
import { PageHeader } from "@/components/PageHeader";
import { getCategories, getMeta } from "@/lib/problems";
import { buildPageMetadata, breadcrumbJsonLd, JsonLd } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "All C Programming Problems — 700 exam-style problems across 7 tiers",
  description:
    "Browse 700 free C programming practice problems across 7 difficulty tiers (Very Easy to Extreme). Instant online C judge with hidden tests — no login required to practice. Built for DIU, NSU, AIUB, and BRAC CSE students.",
  path: "/problems",
  keywords: [
    "C practice problems",
    "C programming problems by difficulty",
    "online judge problems",
    "exam-style C questions",
    "C coding problems for beginners",
    "C problem bank",
    "free C programming practice Bangladesh",
    "C lab exam questions",
  ],
});

type Props = { searchParams: Promise<{ q?: string }> };

export default async function ProblemsPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const categories = getCategories();
  const meta = getMeta();
  const initialQuery = (q ?? "").trim().slice(0, 80);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Problems", path: "/problems" },
        ])}
      />
      <PageHeader
        eyebrow="Always-open C practice"
        title={`All ${meta.total} C programming problems`}
        lead={`Browse by difficulty — ${meta.tiers?.length ?? 7} tiers, ${
          meta.problemsPerTier ?? 100
        } problems each. Core authored problems are marked; generated extras fill each tier for volume practice on our free online C judge.`}
      />
      <Suspense fallback={null}>
        <CategoriesIndexClient categories={categories} initialQuery={initialQuery} />
      </Suspense>
    </div>
  );
}
