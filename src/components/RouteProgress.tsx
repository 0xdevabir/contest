"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A YouTube-style top progress bar. Its whole job is perceived speed: the bar
 * starts the moment a link is clicked — synchronously, before React even begins
 * the transition — so a click is always acknowledged instantly. It then trickles
 * forward and snaps to 100% once the new route commits.
 */
function RouteProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = useRef(false);

  const clearTimers = useCallback(() => {
    if (trickle.current) clearInterval(trickle.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (safety.current) clearTimeout(safety.current);
    trickle.current = null;
    hideTimer.current = null;
    safety.current = null;
  }, []);

  const start = useCallback(() => {
    if (active.current) return;
    active.current = true;
    clearTimers();
    setVisible(true);
    setProgress(12);

    // Ease toward ~90% and stall there until the route actually commits.
    trickle.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p;
        const step = p < 45 ? 9 : p < 70 ? 4 : 1.5;
        return Math.min(90, p + step);
      });
    }, 240);

    // If a navigation never changes the URL (same route, blocked nav), don't
    // leave the bar hanging forever.
    safety.current = setTimeout(() => done(), 8000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearTimers]);

  const done = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    clearTimers();
    setProgress(100);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 260);
  }, [clearTimers]);

  // Complete on every committed navigation (path or query string change).
  useEffect(() => {
    done();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  // Instant feedback: capture link clicks before Next starts its transition.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented) return;
      // Only plain left-clicks navigate in-app.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as Element | null)?.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      // Let hash links, mailto:, tel:, and external origins behave natively.
      if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      let dest: URL;
      try {
        dest = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (dest.origin !== window.location.origin) return;
      // Same page (including in-page anchors) — nothing to load.
      if (dest.pathname === window.location.pathname && dest.search === window.location.search) {
        return;
      }
      start();
    }

    // Programmatic navigations (router.push) go through history.pushState.
    const origPush = window.history.pushState.bind(window.history);
    window.history.pushState = function patched(
      ...args: Parameters<typeof window.history.pushState>
    ) {
      start();
      return origPush(...args);
    };

    document.addEventListener("click", onClick, { capture: true });
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      window.history.pushState = origPush;
    };
  }, [start]);

  useEffect(() => clearTimers, [clearTimers]);

  if (!visible) return null;

  return (
    <div
      className="route-progress"
      style={{
        transform: `scaleX(${progress / 100})`,
        opacity: progress >= 100 ? 0 : 1,
      }}
      role="progressbar"
      aria-hidden
    />
  );
}

export function RouteProgress() {
  return <RouteProgressInner />;
}
