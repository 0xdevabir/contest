import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";
import { getAllProblemIds, getSets, getMeta } from "@/lib/problems";

type SitemapEntry = MetadataRoute.Sitemap[number];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const base: SitemapEntry[] = [
    {
      url: `${BRAND.siteUrl}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${BRAND.siteUrl}/problems`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${BRAND.siteUrl}/sets`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BRAND.siteUrl}/contests`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: `${BRAND.siteUrl}/leaderboard`,
      lastModified: now,
      changeFrequency: "hourly",
      priority: 0.7,
    },
    {
      url: `${BRAND.siteUrl}/register`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];

  // Set pages — 20 entries.
  const sets = getSets();
  const setEntries: SitemapEntry[] = sets.map((s) => ({
    url: `${BRAND.siteUrl}/sets/${s.set}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  // Individual problem pages — but only the authored ones to keep the
  // sitemap manageable. Generated volume-practise problems are reachable
  // through the category index anyway.
  const allIds = getAllProblemIds();
  // Defensive cap: never include more than a few thousand entries.
  const ids = allIds.slice(0, 5000);
  const problemEntries: SitemapEntry[] = ids.map((id) => ({
    url: `${BRAND.siteUrl}/problems/${id}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  // Live contests — fetch with try/catch so the sitemap still works without
  // a database connection.
  let contestEntries: SitemapEntry[] = [];
  try {
    const { prisma } = await import("@/lib/db");
    const contests = await prisma.contest.findMany({
      where: { status: "LIVE" },
      select: { slug: true, updatedAt: true },
      take: 500,
    });
    contestEntries = contests.map((c) => ({
      url: `${BRAND.siteUrl}/contests/${c.slug}`,
      lastModified: c.updatedAt,
      changeFrequency: "hourly",
      priority: 0.8,
    }));
  } catch {
    /* DB not connected — sitemap still serves the static surface */
  }

  // Touch the meta import so it is bundled (and so the bank exists at build).
  void getMeta();

  return [...base, ...setEntries, ...problemEntries, ...contestEntries];
}
