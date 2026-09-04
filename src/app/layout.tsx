import type { Metadata, Viewport } from "next";
import { Syne, IBM_Plex_Sans, IBM_Plex_Mono, Noto_Sans_Bengali } from "next/font/google";
import { cookies, headers } from "next/headers";
import { getSession } from "@/lib/auth";
import { isEnabled } from "@/lib/flags";
import { can } from "@/lib/authz";
import { isStaffAnywhere } from "@/lib/section-access";
import { prisma } from "@/lib/db";
import { Suspense } from "react";
import { SiteChrome } from "@/components/SiteChrome";
import { SmoothScroll } from "@/components/SmoothScroll";
import { RouteProgress } from "@/components/RouteProgress";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ServiceWorkerRegister, PwaKillSwitch } from "@/components/ServiceWorkerRegister";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { BRAND } from "@/lib/brand";
import { THEMES, THEME_COOKIE, normalizeThemeMode, themeCss } from "@/lib/theme";
import { LOCALE_COOKIE, resolveLocale } from "@/i18n";
import { LocaleProvider } from "@/i18n/LocaleProvider";
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

// Bangla UI (Phase 14, D3). The system font on many mid-range Android
// devices renders Bangla conjuncts poorly, so this is self-hosted rather
// than left to fall back — only preloaded when the resolved locale is "bn".
const notoBengali = Noto_Sans_Bengali({
  subsets: ["bengali"],
  variable: "--font-bengali",
  weight: ["400", "500", "600", "700"],
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
    "application-name": BRAND.name,
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-title": BRAND.name,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Static default; ThemeProvider rewrites the meta tag once the active theme
  // is known on the client.
  themeColor: THEMES.dark.palette.bg,
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

  // Phase 6 — a small "assignments due soon" nav badge for students. Kept
  // to a single cheap count query, and only run for the role that can ever
  // have one, so this doesn't add DB load to every other page view.
  let assignmentsDueSoon = 0;
  if (user && user.role === "STUDENT") {
    const classroomOn = await isEnabled("classroom", { userId: user.id, role: user.role });
    if (classroomOn) {
      const sectionIds = (
        await prisma.enrollment.findMany({ where: { userId: user.id, status: "ACTIVE" }, select: { sectionId: true } })
      ).map((e) => e.sectionId);
      if (sectionIds.length > 0) {
        assignmentsDueSoon = await prisma.assignment.count({
          where: {
            sectionId: { in: sectionIds },
            published: true,
            dueAt: { gte: new Date(), lte: new Date(Date.now() + 48 * 60 * 60 * 1000) },
          },
        });
      }
    }
  }

  // A nav link into the /teacher panel for approved teachers, and for TAs
  // who don't own a section but staff one (teacher/layout.tsx's own gate
  // mirrors this — see can(session, "problem:create") there). Admins reach
  // the classroom panel through /admin instead, so this is skipped for them.
  let teacherNav: { href: string; label: string } | null = null;
  if (user && user.role !== "ADMIN") {
    if (can(user, "problem:create")) {
      teacherNav = { href: "/teacher", label: "Teacher" };
    } else {
      const classroomOn = await isEnabled("classroom", { userId: user.id, role: user.role });
      if (classroomOn && (await isStaffAnywhere(user.id))) {
        teacherNav = { href: "/teacher/sections", label: "Teaching" };
      }
    }
  }

  // Phase 11 — unread notification count for the nav bell. Same
  // cheap-single-query, flag-guarded pattern as assignmentsDueSoon above.
  let unreadNotifications = 0;
  if (user) {
    const communityOn = await isEnabled("community", { userId: user.id, role: user.role });
    if (communityOn) {
      unreadNotifications = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
    }
  }

  const jar = await cookies();
  // The user's stored preference wins; the cookie is what the very first paint
  // has to go on, so it is set on both login and every theme change.
  const initialTheme = normalizeThemeMode(
    user?.theme ?? jar.get(THEME_COOKIE)?.value
  );
  const htmlTheme = initialTheme === "system" ? undefined : initialTheme;

  // Phase 14 D1 — resolved server-side so the very first RSC payload is
  // already in the right language: user preference -> locale cookie ->
  // Accept-Language -> English.
  const hdrs = await headers();
  const locale = resolveLocale({
    userLocale: user?.locale,
    cookieLocale: jar.get(LOCALE_COOKIE)?.value,
    acceptLanguage: hdrs.get("accept-language"),
  });
  const pwaOn = await isEnabled("pwa", user ? { userId: user.id, role: user.role } : undefined);

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
        "Seven difficulty tiers from Very Easy to Extreme",
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
    <html
      lang={locale}
      data-theme={htmlTheme}
      data-locale={locale}
      suppressHydrationWarning
    >
      <head>
        {/* Every colour token in the app, generated from src/lib/theme.ts. */}
        <style id="theme-tokens" dangerouslySetInnerHTML={{ __html: themeCss() }} />
      </head>
      <body
        className={`${syne.variable} ${plexSans.variable} ${plexMono.variable} ${notoBengali.variable} antialiased`}
        style={
          {
            ["--font-display" as string]: "var(--font-syne), system-ui, sans-serif",
            // Bangla prose gets the self-hosted Bengali face ahead of the
            // Latin body font; Latin text inside it (code, verdicts, ranks)
            // is unaffected since those live in --font-mono / data contexts.
            ["--font-body" as string]:
              locale === "bn"
                ? "var(--font-bengali), var(--font-plex-sans), system-ui, sans-serif"
                : "var(--font-plex-sans), system-ui, sans-serif",
            ["--font-mono" as string]: "var(--font-plex-mono), ui-monospace, monospace",
            // D3 — Bangla needs ~1.7 line height vs 1.5 for Latin.
            lineHeight: locale === "bn" ? 1.7 : undefined,
          } as React.CSSProperties
        }
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <ThemeProvider initial={initialTheme} signedIn={!!user}>
          <LocaleProvider initial={locale} signedIn={!!user}>
            {pwaOn ? <ServiceWorkerRegister /> : <PwaKillSwitch />}
            {pwaOn ? <OfflineIndicator /> : null}
            <Suspense fallback={null}>
              <RouteProgress />
            </Suspense>
            <SmoothScroll />
            <SiteChrome user={user} assignmentsDueSoon={assignmentsDueSoon} unreadNotifications={unreadNotifications} teacherNav={teacherNav}>{children}</SiteChrome>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
