import type { Metadata } from "next";
import { BRAND } from "@/lib/brand";

/** Absolute URL helper — always uses the resolved public site URL. */
export function absoluteUrl(path = "/"): string {
  const base = BRAND.siteUrl.replace(/\/$/, "");
  if (!path || path === "/") return `${base}/`;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function pageKeywords(...extra: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of [...extra, ...BRAND.keywords]) {
    const key = k.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(k.trim());
  }
  return out;
}

type MetaOpts = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  type?: "website" | "article";
  noIndex?: boolean;
};

/** Shared metadata builder so every public page gets consistent OG/Twitter/canonical. */
export function buildPageMetadata({
  title,
  description,
  path,
  keywords = [],
  type = "website",
  noIndex = false,
}: MetaOpts): Metadata {
  const url = path.startsWith("/") ? path : `/${path}`;
  return {
    title,
    description,
    keywords: pageKeywords(...keywords),
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type,
      siteName: BRAND.name,
      locale: BRAND.locale,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      creator: BRAND.twitterHandle,
    },
    robots: noIndex
      ? { index: false, follow: true }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        },
  };
}

type Crumb = { name: string; path: string };

export function breadcrumbJsonLd(crumbs: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}

export function learningResourceJsonLd(opts: {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  topic?: string | null;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "LearningResource",
    name: opts.title,
    description: opts.description,
    url: absoluteUrl(`/problems/${opts.id}`),
    learningResourceType: "Programming exercise",
    educationalLevel: opts.difficulty,
    about: opts.topic || "C programming",
    inLanguage: "en",
    isAccessibleForFree: true,
    teaches: "C programming",
    provider: {
      "@type": "Organization",
      name: BRAND.name,
      url: absoluteUrl("/"),
    },
    programmingLanguage: "C",
  };
}

export function faqJsonLd(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.a,
      },
    })),
  };
}

export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
