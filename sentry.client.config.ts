import * as Sentry from "@sentry/nextjs";

// NEXT_PUBLIC_SENTRY_DSN, not SENTRY_DSN — this file ships to the browser, so
// only the public (client-side) DSN belongs here. Absent it, Sentry stays off.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    debug: false,
  });
}
