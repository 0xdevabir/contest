import * as Sentry from "@sentry/nextjs";

// Absent SENTRY_DSN disables Sentry cleanly — local dev and contributors
// without a Sentry project are unaffected. src/lib/log.ts's own dynamic
// import is the actual capture path for application errors; this file only
// wires up Sentry's Next.js server-side request instrumentation.
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
    // Keep noisy debug logging off in normal operation.
    debug: false,
  });
}
