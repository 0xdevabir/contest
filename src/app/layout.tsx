import type { Metadata, Viewport } from "next";
import { Syne, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { getSession } from "@/lib/auth";
import { SiteChrome } from "@/components/SiteChrome";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  weight: ["500", "600", "700", "800"],
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-plex-sans",
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
});

const SITE_URL = BRAND.siteUrl;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.description,
  keywords: [...BRAND.keywords],
  applicationName: BRAND.name,
  authors: [{ name: BRAND.name, url: SITE_URL }],
  creator: BRAND.name,
  publisher: BRAND.name,
  category: "Education",
  classification: "Competitive Programming, Online Judge, C Programming",
  abstract:
    "Online judge for C programming with 700 exam-style problems and live inter-university contests.",
  referrer: "strict-origin-when-cross-origin",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: "/",
    languages: {
      "en-US": "/",
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: BRAND.name,
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.description,
    // The og image is auto-discovered from `app/opengraph-image.tsx` so we
    // do not need to hard-code the URL here.
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.description,
    creator: BRAND.twitterHandle,
    // The twitter image is auto-discovered from `app/twitter-image.tsx`
    // (we share the same image as OG by convention).
  },
  robots: {
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
  icons: {
    // Next.js auto-discovers `app/icon.tsx` and `app/apple-icon.tsx`, but we
    // also reference the static `favicon.ico` shipped in `public/` for legacy
    // clients that do not follow the convention.
    icon: ["/favicon.ico"],
    shortcut: ["/favicon.ico"],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: BRAND.name,
  },
  other: {
    "theme-color": "#080b10",
    "application-name": BRAND.name,
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-title": BRAND.name,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#080b10",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let user = null;
  try {
    user = await getSession();
  } catch {
    user = null;
  }

  // JSON-LD: organization + website + software application. Helps Google
  // build a richer SERP card (sitelinks, software app rich result, etc.).
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: BRAND.name,
      url: SITE_URL,
      logo: `${SITE_URL}/icon-512.png`,
      description: BRAND.shortDescription,
      sameAs: [
        "https://github.com/0xdevabir/contest",
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: BRAND.name,
      url: SITE_URL,
      inLanguage: "en-US",
      description: BRAND.description,
      publisher: {
        "@type": "Organization",
        name: BRAND.name,
      },
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_URL}/problems?search={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: BRAND.name,
      url: SITE_URL,
      applicationCategory: "EducationalApplication",
      applicationSubCategory: "Online Judge / Competitive Programming",
      operatingSystem: "Web",
      browserRequirements: "Requires modern browser with JavaScript",
      description: BRAND.description,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      featureList: [
        "700 exam-style C problems",
        "Instant judge with AC, WA, TLE, RE, MLE, CE verdicts",
        "20 curriculum sets from Very Easy to Extreme",
        "Live inter-university contests",
        "University leaderboards",
        "Submission history and progress tracking",
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "EducationalOrganization",
      name: BRAND.university,
      url: SITE_URL,
      description: `Online judge and competitive programming platform of ${BRAND.university}.`,
    },
  ];

  return (
    <html lang="en">
      <body
        className={`${syne.variable} ${plexSans.variable} ${plexMono.variable} antialiased`}
        style={
          {
            ["--font-display" as string]: "var(--font-syne), system-ui, sans-serif",
            ["--font-body" as string]: "var(--font-plex-sans), system-ui, sans-serif",
            ["--font-mono" as string]: "var(--font-plex-mono), ui-monospace, monospace",
          } as React.CSSProperties
        }
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <SiteChrome user={user}>{children}</SiteChrome>
      </body>
    </html>
  );
}