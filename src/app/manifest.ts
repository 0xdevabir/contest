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
    lang: "en",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png" },
      { src: "/icon-512", sizes: "512x512", type: "image/png" },
      { src: "/icon", sizes: "32x32", type: "image/png" },
    ],
  };
}

