# Runbook

Incident procedures for ContestHub. Starts thin in Phase 0 and grows with
each phase — add an entry here whenever a phase introduces a new failure mode
an on-call person would need to diagnose without reading the source first.

---

## Judge is refusing to run submissions (`IE` / "Judge is not configured")

**Symptom**: every submission and run comes back with verdict `IE` and the
message "Judge is not configured." Server logs show:

```
Judge misconfigured: no runner/remote judge configured and
ALLOW_INSECURE_LOCAL_JUDGE is not set in production. Refusing to compile
untrusted code in-process.
```

**Cause**: this is the F-1 safety gate in `src/lib/judge.ts`'s
`localJudgeAllowed()` working as designed. In production, with `NODE_ENV`
unset or `"production"`, the in-process compile-and-run path is disabled
unless one of the real execution backends is configured — a bare deployment
with none of them configured must refuse to judge, not silently fall back to
running untrusted code with the server's own environment and no sandbox.

**Fix**: configure exactly one real backend, in order of preference:

1. **Runner** (preferred): set `NEXT_PUBLIC_RUNNER_URL` and `RUNNER_TOKEN` to
   point at a running `runner/` service with `contest-hub-sandbox` built
   (`npm run build:image` in `runner/`). Redeploy — `NEXT_PUBLIC_RUNNER_URL`
   is inlined at build time.
2. **Remote judge**: set `JUDGE0_URL` (and `JUDGE0_KEY`/`JUDGE0_HOST` if using
   a hosted instance).
3. **Last resort, self-hosted-only**: set `ALLOW_INSECURE_LOCAL_JUDGE=1`. This
   re-enables the in-process compiler with no sandbox isolation — only
   acceptable when the whole app process itself is already sufficiently
   isolated (e.g. a disposable VM with nothing else on it). Do not set this on
   a shared or multi-tenant deployment.

**Verify**: submit any problem's sample input and confirm a real verdict
(not `IE`) comes back. `src/lib/judge.test.ts`'s `localJudgeAllowed` suite is
the permanent regression guard for this gate — a change that silently expands
when the local path is allowed should fail that suite.

---

## Judge runner returning `RE`/`fetch failed` instead of judging

**Symptom**: logs show `runner judge failed, falling back` with a `fetch`
error, and the app falls through to remote judge / local compile.

**Cause**: `NEXT_PUBLIC_RUNNER_URL` or `RUNNER_TOKEN` point at a runner
that's down, unreachable, or has a mismatched token. `compileAndJudge()`
catches this and falls back automatically — the request still gets a verdict,
just via a slower/weaker path — but it means the runner's guarantees (Docker
sandbox isolation, wall-clock-accurate timing) are not actually in effect for
that request.

**Fix**: check the runner service's `/health` endpoint and process status.
Confirm `RUNNER_TOKEN` matches between the app and the runner's own env.
Confirm the sandbox image exists (`docker image inspect contest-hub-sandbox`
on the runner host) — the runner refuses to start without it.

---

## Legitimate users hitting `429` rate limits

**Symptom**: a lab of students behind one NAT IP (or a single very active
user) starts seeing `429` responses with a `Retry-After` header.

**Cause**: `src/lib/ratelimit.ts`'s per-identity token buckets — see the
table in that file's header comment for current limits per bucket
(`run:anon`, `run:user`, `submit:user`, `submit:problem`, `auth:login`,
`auth:forgot`, `runticket`). Anonymous (`run:anon`) buckets key on IP, so a
whole lab behind one router shares one bucket.

**Fix, in order of preference**:

1. If it's a genuine one-off spike (e.g. a graded lab session), this is
   working as intended — advise students to sign in, since `run:user` limits
   are 6x higher than `run:anon` and are keyed per-account instead of shared
   per-IP.
2. If limits are structurally too tight for normal use, set
   `FLAGS_RATELIMIT=0` to disable enforcement while `consume()` still runs
   and reports what *would* have been limited (check logs) — this buys time
   to retune the numbers on real traffic data without leaving the endpoint
   fully unmetered.
3. Institution-level IP allowlisting is out of scope for Phase 0 — tracked
   for Phase 1.

**Do not** raise `ANON_RUN_CONCURRENCY` or the `run:anon` token count as a
first response to a report of `429`s without checking whether the traffic is
actually legitimate — F-2 exists because anonymous judge execution is a
real abuse surface (unmetered compute on the public internet), not a UX
inconvenience to be tuned away by default.

---

## Suspected environment/secret leak from a submission

**Symptom**: a submission's stdout contains something that looks like a
connection string, API key, or other secret shape.

**Cause**: this should be structurally impossible after F-1 — `runProcess()`
in `src/lib/judge.ts` spawns every compile and run with `env: SANDBOX_ENV`
(a fixed, secret-free allowlist: `PATH`, `LANG`, `LC_ALL`, `HOME`), never
`process.env`. Treat any report of this as a **severity-1 security
regression**, not routine rate-limit noise.

**Immediate response**:

1. Confirm by re-running `src/lib/judge.test.ts`'s F-1 regression test
   (`runCustom` a `getenv("DATABASE_URL")` printer, assert empty stdout) and,
   if Docker is available, the golden suite's `env-read` case.
   `git blame src/lib/judge.ts` around `SANDBOX_ENV` and `runProcess` for
   anything that reintroduced `process.env`.
2. If confirmed, rotate every credential currently in the server's
   environment (`DATABASE_URL`/`DIRECT_URL`, `AUTH_SECRET`, `SMTP_*`,
   `RUNNER_TOKEN`, `JUDGE0_KEY`) — assume the exposure was not limited to
   whoever reported it.
3. Revert to the last known-good deploy while the regression is fixed and
   the F-1 test suite is confirmed green again.

---

## `prisma migrate status` reports drift

**Symptom**: `npx prisma migrate status` shows the database schema does not
match `prisma/migrations/`.

**Cause**: someone ran `prisma db push` (or a manual `ALTER`/`CREATE`)
directly against an environment instead of going through a migration. Phase 0
retired `db push` from normal use — it survives only as `db:push:danger` for
throwaway local work, precisely because a graded system cannot tolerate
undocumented schema drift.

**Fix**: never run `prisma migrate resolve` to paper over unexplained drift.
Diff what actually changed (`prisma migrate diff --from-url <url>
--to-schema-datamodel prisma/schema.prisma`), understand why it happened, and
either write a proper migration capturing the intended change or reconcile
the drifted environment back to match `prisma/schema.prisma` before
resuming normal `db:migrate`/`db:deploy` use.
