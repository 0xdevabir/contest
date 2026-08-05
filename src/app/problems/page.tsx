import { CategoriesIndexClient } from "@/components/CategoriesIndexClient";
import { PageHeader } from "@/components/PageHeader";
import { getCategories, getMeta } from "@/lib/problems";

export const metadata = {
  title: "Problems",
  description: "Practice 700 C programming problems by difficulty category.",
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
