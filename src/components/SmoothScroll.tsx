"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

/**
 * Routes where nested scroll panels (Monaco, xterm, admin tables) own the
 * viewport — Lenis on <html> fights them, so we stay on native scroll there.
 */
function shouldUseLenis(pathname: string): boolean {
  if (pathname.startsWith("/admin")) return false;
  // Individual problem workspace (/problems/set1-q1) — not the index.
  if (/^\/problems\/[^/]+/.test(pathname)) return false;
  return true;
}

/**
 * Site-wide inertia scrolling. Respects prefers-reduced-motion and tears down
 * cleanly on route changes so the code editor keeps native nested scroll.
 */
export function SmoothScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!shouldUseLenis(pathname)) return;

    const lenis = new Lenis({
      // Slightly snappy — “premium” without feeling floaty on long lists.
      duration: 1.05,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 0.92,
      touchMultiplier: 1.15,
      autoRaf: true,
      anchors: true,
    });

    return () => {
      lenis.destroy();
    };
  }, [pathname]);

  // Keep problem / admin pages at the top after client navigations.
  useEffect(() => {
    if (shouldUseLenis(pathname)) return;
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
