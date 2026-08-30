/**
 * Single-line structured logging. Not a framework — `console.*` is banned in
 * `src/lib` and `src/app/api` by eslint so every log line goes through here and
 * comes out as one JSON object per line, greppable and machine-parseable.
 *
 * Errors are additionally reported to Sentry when SENTRY_DSN is set; the
 * import is dynamic and failures are swallowed so a missing/misconfigured
 * Sentry SDK can never take logging (or the request it's logging about) down
 * with it.
 */

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

function emit(level: Level, msg: string, fields?: Fields) {
  const line = JSON.stringify({ level, msg, time: new Date().toISOString(), ...fields });
  if (level === "error" || level === "warn") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

function errorFields(err: unknown): Fields {
  if (err instanceof Error) {
    return { errorName: err.name, errorMessage: err.message, stack: err.stack };
  }
  if (err === undefined) return {};
  return { error: String(err) };
}

function captureToSentry(err: unknown, context: Fields) {
  if (!process.env.SENTRY_DSN) return;
  import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.captureException(err instanceof Error ? err : new Error(String(context.msg ?? "error")), {
        extra: context,
      });
    })
    .catch(() => {
      /* Sentry unavailable or misconfigured — logging must never depend on it */
    });
}

export const log = {
  debug(msg: string, fields?: Fields) {
    if (process.env.NODE_ENV !== "production") emit("debug", msg, fields);
  },
  info(msg: string, fields?: Fields) {
    emit("info", msg, fields);
  },
  warn(msg: string, fields?: Fields) {
    emit("warn", msg, fields);
  },
  error(msg: string, fields?: Fields, err?: unknown) {
    const all = { ...fields, ...errorFields(err) };
    emit("error", msg, all);
    captureToSentry(err, { msg, ...all });
  },
};
