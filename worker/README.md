# Judge worker

Standalone deployable that consumes the `judge` BullMQ queue and runs the
same judge engine (`src/lib/judge/*`) the synchronous path uses — one
implementation, two entry points. See
`docs/phases/DONE__PHASE-04-judge-queue.md` for the full design (D1–D5).

## Why this can't run on Vercel

Judging needs a Docker daemon and cgroups to sandbox untrusted code — Vercel
functions have neither. This is why the deployment topology changes here:
the web app stays on Vercel, and `worker/` runs on a plain VPS (a Hetzner
CX32 or equivalent — 4 vCPU / 8GB is enough for a lab-quiz-scale contest).

## Local development

```bash
docker compose up redis          # from the repo root
FLAGS_JUDGE_QUEUE=1 npm run dev  # terminal 1 — the web app
npm run worker:dev                # terminal 2 — the worker, tsx watch
```

Submit a problem while `FLAGS_JUDGE_QUEUE=1` is set and you should see a
`202 { submissionId, state: "QUEUED" }` immediately, then the SSE stream
carry it through `JUDGING` to a final verdict.

## Production deployment (VPS)

1. Provision a VPS. Install Docker.
2. `docker build -t contesthub-worker -f worker/Dockerfile .`
3. Run it with the host's Docker socket mounted so it can orchestrate
   sibling sandbox containers (the same `runner/images/*` images the
   synchronous path uses) without nesting Docker-in-Docker:

   ```bash
   docker run -d --name judge-worker \
     --restart unless-stopped \
     -v /var/run/docker.sock:/var/run/docker.sock \
     -e REDIS_URL=... \
     -e DATABASE_URL=... \
     -e DIRECT_URL=... \
     -e JUDGE_SHARED_SECRET=... \
     -e WORKER_CONCURRENCY=4 \
     contesthub-worker
   ```

## Security — this box runs nothing else

Mounting `/var/run/docker.sock` grants root-equivalent access to the host.
**The worker VPS must run nothing else: no web app, no database, no
secrets beyond the four env vars above.** A compromised worker container
is a compromised host; don't let that host also hold anything else worth
stealing.

The worker's Postgres role should have `SELECT` on `Problem`/`ProblemVersion`/
`TestGroup`/`TestCase` and `UPDATE` (not `DELETE`) on `Submission` only — not
`User.passwordHash`, not `DELETE` anywhere:

```sql
CREATE ROLE judge_worker LOGIN PASSWORD '...';
GRANT SELECT ON "Problem", "ProblemVersion", "TestGroup", "TestCase",
  "ReferenceSolution" TO judge_worker;
GRANT SELECT, UPDATE ON "Submission" TO judge_worker;
GRANT SELECT, INSERT, UPDATE ON "JudgeWorker" TO judge_worker;
GRANT SELECT, INSERT, UPDATE ON "RejudgeBatch" TO judge_worker;
GRANT SELECT, INSERT, UPDATE ON "ProblemStats", "SolvedProblem" TO judge_worker;
```

Point the worker's `DATABASE_URL` at this role, not the app's admin role.

## Fallback: no direct DB access

`worker/src/index.ts` writes to Postgres directly — the primary path. For a
topology where the worker's network can reach Redis but not Postgres,
`POST /api/internal/judge/report` (HMAC-authenticated with
`JUDGE_SHARED_SECRET`) exists as the receiving side of that fallback: it
shares `reportSubmission`/`claimSubmission` (`src/lib/submission-state.ts`)
with the direct path, so the report shape is identical either way. Wiring the
worker itself to post there instead of writing directly (an env-var toggle)
is not implemented yet — add it if you actually hit this topology.

## Operational notes

- **Alerts and their runbook entries**: `docs/RUNBOOK.md` § "Judge queue".
- **Load testing**: `npm run loadtest` (`scripts/loadtest/contest.ts`) drives
  the six scenarios from the phase doc. Record real numbers in
  `docs/CAPACITY.md` after running it against a real deployment — nothing in
  this repo has been run against one yet.
- A `docker-compose.yml` at the repo root brings up a local Redis (and,
  behind the `worker` profile, this image) for development.
