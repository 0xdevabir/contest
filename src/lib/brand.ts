/**
 * Brand + SEO source of truth.
 *
 * Keyword strategy (priority order for titles/H1s/descriptions):
 * 1. Primary: "online judge", "C programming practice", "DIU ContestHub"
 * 2. Product: "exam-style C problems", "C programming contest", "instant C judge"
 * 3. Geo/uni: DIU, NSU, AIUB, BRAC, Bangladesh competitive programming
 * 4. Intent: lab/exam prep, ICPC practice, hidden test cases, AC/WA/TLE
 *
 * Set NEXT_PUBLIC_APP_URL (or APP_URL) in production so canonicals, OG,
 * sitemap, and JSON-LD resolve to the real domain.
 */

const PRODUCTION_SITE_URL = "https://diucode.devabir.me";

function resolveSiteUrl(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.APP_URL?.replace(/\/$/, "");
  // Local/dev APP_URL is fine for emails, but never ship localhost or the
  // placeholder domain into public SEO surfaces (sitemap, robots, JSON-LD).
  if (
    fromEnv &&
    !/localhost|127\.0\.0\.1|diucontesthub\.local/i.test(fromEnv)
  ) {
    return fromEnv;
  }
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") {
    return PRODUCTION_SITE_URL;
  }
  return fromEnv || "http://localhost:3000";
}

export const BRAND = {
  name: "DIU ContestHub",
  prefix: "DIU",
  wordmark: "ContestHub",
  university: "Daffodil International University",
  universityUrl: "https://daffodilvarsity.edu.bd",
  tagline: "Exam-style C training and live contests",
  shortDescription:
    "Free online judge for C programming — practice exam-style problems, run code against hidden tests, and compete in live inter-university contests with DIU, NSU, AIUB, and BRAC.",
  description:
    "DIU ContestHub is a free online judge for C programming from Daffodil International University: 700 exam-style C practice problems across 7 difficulty tiers (Very Easy to Extreme), an instant gcc/clang judge with AC, WA, TLE, RE, MLE, and CE verdicts, and live inter-university programming contests between DIU, NSU, AIUB, and BRAC University.",
  /** Primary + secondary keyword bank used in root metadata and page targeting. */
  keywords: [
    // Primary product
    "online judge",
    "C online judge",
    "C programming judge",
    "online C compiler",
    "C programming practice",
    "C practice problems",
    "exam-style C problems",
    "C exam preparation",
    "C lab exam practice",
    "structured programming practice",
    // Contests & CP
    "programming contest",
    "online coding contest",
    "competitive programming",
    "competitive programming Bangladesh",
    "ICPC practice",
    "ICPC style contest",
    "programming contest scoreboard",
    // Brand & universities
    "DIU ContestHub",
    "DIU online judge",
    "DIU programming contest",
    "Daffodil International University",
    "NSU programming contest",
    "AIUB programming contest",
    "BRAC programming contest",
    "DIU NSU AIUB BRAC contest",
    "university programming contest Bangladesh",
    // Intent / feature
    "hidden test cases",
    "AC WA TLE RE CE",
    "gcc clang judge",
    "free C coding problems",
    "C programming for beginners Bangladesh",
    "CSE programming practice",
  ],
  siteUrl: resolveSiteUrl(),
  productionSiteUrl: PRODUCTION_SITE_URL,
  twitterHandle: "@diucontesthub",
  supportEmail: "noreply@diucode.devabir.me",
  developer: "MD ABIR HOSSAIN",
  locale: "en_US",
  language: "en",
  country: "BD",
} as const;

export type BrandKeyword = (typeof BRAND.keywords)[number];

