import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";
import { THEMES } from "@/lib/theme";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: "ContestHub",
    description: BRAND.shortDescription,
    start_url: "/",
    display: "standalone",
    background_color: THEMES.dark.palette.bg,
    theme_color: THEMES.dark.palette.bg,
    orientation: "any",
    scope: "/",
    // The manifest itself stays English — Chrome doesn't re-fetch it per
    // request, so it can't follow the resolved-locale cookie. The app UI
    // (D1) is what actually renders in Bangla; this only affects the
    // OS-level install prompt/app name.
    lang: "en",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png" },
      { src: "/icon", sizes: "32x32", type: "image/png" },
    ],
    // Phase 14 D4 — jump straight to the two things a student opens a PWA
    // for: practicing and checking a live contest.
    shortcuts: [
      { name: "Problems", url: "/problems", description: "Browse practice problems" },
      { name: "Contests", url: "/contests", description: "See live and upcoming contests" },
    ],
  };
}

