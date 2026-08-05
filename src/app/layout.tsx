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

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s · ${BRAND.name}`,
  },
  description: BRAND.description,
  applicationName: BRAND.name,
  openGraph: {
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.description,
    siteName: BRAND.name,
    type: "website",
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
        <SiteChrome user={user}>{children}</SiteChrome>
      </body>
    </html>
  );
}

