import { Suspense } from "react";
import type { Metadata } from "next";
import { ProblemArchiveClient } from "@/components/ProblemArchiveClient";
import { PageHeader } from "@/components/PageHeader";
import { ListSkeleton } from "@/components/Skeleton";
import { getMeta } from "@/lib/problems";
import { listTags } from "@/lib/tags";
import { getSession } from "@/lib/auth";
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

export default async function ProblemsPage() {
  const meta = await getMeta();
  const tags = await listTags();

  let session = null;
  try {
    session = await getSession();
  } catch {
    session = null;
  }

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
        lead="Search the bank, then narrow by difficulty, topic, or solve status. Filters stay in the URL so you can share a view."
      />
      <Suspense fallback={<ListSkeleton rows={10} />}>
        <ProblemArchiveClient tags={tags} loggedIn={Boolean(session)} />
      </Suspense>
    </div>
  );
}
