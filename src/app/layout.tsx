import type { Metadata, Viewport } from "next";
import { Syne, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { getSession } from "@/lib/auth";
import { SiteChrome } from "@/components/SiteChrome";
import { SmoothScroll } from "@/components/SmoothScroll";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  weight: ["600", "700"],
  display: "swap",
  preload: true,
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-plex-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: true,
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
  display: "swap",
  preload: false,
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
  publisher: BRAND.university,
  category: "Education",
  classification: "Competitive Programming, Online Judge, C Programming, Bangladesh",
  abstract:
    "Free online judge for C programming with 700 exam-style problems and live inter-university contests.",
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
      alternateName: ["ContestHub", "DIU Contest Hub", "DIU online judge"],
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/icon`,
      },
      image: `${SITE_URL}/opengraph-image`,
      description: BRAND.shortDescription,
      email: BRAND.supportEmail,
      address: {
        "@type": "PostalAddress",
        addressCountry: BRAND.country,
        addressLocality: "Dhaka",
      },
      areaServed: {
        "@type": "Country",
        name: "Bangladesh",
      },
      sameAs: ["https://github.com/0xdevabir/contest"],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: BRAND.name,
      url: SITE_URL,
      inLanguage: BRAND.locale.replace("_", "-"),
      description: BRAND.description,
      publisher: {
        "@type": "Organization",
        name: BRAND.name,
      },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_URL}/problems?q={search_term_string}`,
        },
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
      keywords: BRAND.keywords.join(", "),
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "BDT",
        availability: "https://schema.org/InStock",
      },
      featureList: [
        "700 exam-style C programming practice problems",
        "Instant online C judge with AC, WA, TLE, RE, MLE, CE verdicts",
        "20 curriculum sets from Very Easy to Extreme",
        "Live inter-university programming contests",
        "University leaderboards for DIU, NSU, AIUB, BRAC",
        "Submission history and progress tracking",
        "Free online C compiler and hidden test cases",
      ],
      audience: {
        "@type": "EducationalAudience",
        educationalRole: "student",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "EducationalOrganization",
      name: BRAND.university,
      url: BRAND.universityUrl,
      description: `${BRAND.university} — home of ${BRAND.name}, a free online judge for C programming practice and contests.`,
      address: {
        "@type": "PostalAddress",
        addressCountry: "BD",
        addressLocality: "Dhaka",
      },
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
        <SmoothScroll />
        <SiteChrome user={user}>{children}</SiteChrome>
      </body>
    </html>
  );
}

