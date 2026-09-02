# Judge queue capacity

Real numbers from `npm run loadtest` (`scripts/loadtest/contest.ts`) against a
live deployment, per docs/phases/DONE__PHASE-04-judge-queue.md's load-testing
section. **Nothing in this file has been measured yet** — this is the
template to fill in the first time the load test actually runs against a
real worker/Redis/Postgres deployment (not local dev).

## Host spec

| Component | Spec |
|---|---|
| Web app | (Vercel plan / region) |
| Worker VPS | (provider, vCPU, RAM, disk) |
| Redis | (Upstash plan, or self-hosted spec) |
| Postgres | (Neon plan / compute size) |
| Worker count / concurrency | (N workers × M concurrency each) |

## Results

| Scenario | Shape | Pass condition | Measured | Pass? |
|---|---|---|---|---|
| Lab quiz | 60 users, 1 submission each within 60s, 10 tests | p95 verdict ≤ 15s, zero IE | — | — |
| Midterm | 200 users, 3 submissions each over 10 min | p95 ≤ 25s, queue drains within 60s of last submission | — | — |
| Contest burst | 300 submissions in 30s | No web request > 500ms; no dropped jobs | — | — |
| Fairness | 1 user submits 20, 20 users submit 1 | The 20 single-submitters' p95 ≤ 2× baseline | — | — |
| Worker death | Kill a worker mid-contest | All in-flight jobs re-queue and complete; zero lost submissions | — | — |
| Redis restart | Restart Redis mid-contest | Queue rebuilds from `state = 'QUEUED'`; zero lost submissions | — | — |

## Answering "how many workers for a 300-student exam"

Fill in after running the Contest burst and Midterm scenarios above against
the actual target host spec:

- Sustainable submissions/min per worker at the observed p95: —
- Recommended worker count for a 300-student exam (headroom for the
  last-minute rush): —
