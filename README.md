<div align="center">

# CodeHub

**The competitive programming platform of Daffodil International University.**

Exam-style C practice, classroom assignments and inter-university contests across
70+ registered Bangladeshi institutions — with a hardened multi-language judge,
live standings, ratings and an AI assist layer.

[![CI](https://github.com/0xdevabir/contest/actions/workflows/ci.yml/badge.svg)](https://github.com/0xdevabir/contest/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)

[Features](#features) · [Architecture](#architecture) · [Quick start](#quick-start) ·
[Configuration](#configuration) · [Scripts](#scripts) · [Testing](#testing) ·
[Deployment](#deployment) · [Docs](#documentation) · [Contributing](#contributing)

</div>

---

## Features

### Practice & problems
- **700+ exam-style C problems** — practice without logging in; versioned in
  Postgres with tags, difficulty and a filterable public archive.
- **Multi-language judge** — C11, C++17, C++20, Python 3.11, Java 17 and Node 22,
  each in its own locked-down Docker sandbox.
- **Rich checkers** — exact, token, float-epsilon, special (custom checker) and
  interactive problems, with subtask-grouped scoring.
- **Interactive terminal** — a real pty streamed over WebSocket, so `printf`
  prompts appear immediately and `scanf` waits for input.

### Authoring & teaching
- **Problem authoring** — Markdown + LaTeX statements, test data via zip upload
  or hand-typed, and reference solutions.
- **Publish gate** — a problem cannot go live until a reference solution actually
  compiles and passes the judge; authored problems go through a setter review queue.
- **Classroom** — courses, sections, rosters, assignments, late policies and a gradebook.
- **Academic integrity** — fingerprint-based plagiarism detection, proctoring-lite
  and per-student exam variants.

### Contests
- **Contest control center** — scheduling, rules, problem ordering, go-live and monitoring.
- **Pluggable scoring** — ICPC, IOI and Codeforces-style, with scoreboard freeze.
- **Live experience** — clarifications, announcements, real-time standings (SSE),
  teams, balloon delivery, projector mode and resolver.
- **Participation modes** — live, virtual (shadow-ranked) and practice/upsolve.
- **Visibility & access** — public, unlisted, institution-only or private contests.

### Identity & community
- **Institutions** — searchable directory of 70+ seeded Bangladeshi institutions
  with email-domain auto-verification.
- **Roles** — `STUDENT`, `TEACHER`, `TA`, `ADMIN`; teacher signups need admin approval.
- **Secure auth** — email verification, password reset (SMTP), revocable sessions
  with refresh-token rotation and reuse detection.
- **Ratings & leaderboards** — Elo-MMR ratings, seasons, badges, certificates (PDF),
  and per-institution practice/contest boards.
- **Community** — editorials, discussions, notifications (in-app, email, web push).

### Platform & ops
- **Admin command center** — analytics, system health, cost tracking, moderation,
  user management, rejudge and full submission inspection with audit history.
- **Public API** — versioned REST API (`/api/v1`) with OpenAPI spec, API keys and webhooks.
- **Federation** — Polygon package import and remote judging.
- **Scale & reliability** — Redis/BullMQ judge queue, read models, partitioning,
  queue-depth autoscaling, SLO alerting and documented DR drills.
- **Localization & PWA** — English and Bangla, WCAG AA targets, offline lab mode.
- **AI assist** (optional, Claude) — test generation, editorial drafts, problem
  variants, hints, translations and recommendations — all behind a feature flag
  and budget guardrails.

## Tech stack

| Layer | Technology |
|---|---|
| Web app | [Next.js 15](https://nextjs.org) (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Editor | Monaco Editor, xterm.js |
| Database | PostgreSQL 16 via [Prisma 6](https://www.prisma.io) |
| Queue / realtime | Redis 7, [BullMQ](https://docs.bullmq.io), Server-Sent Events |
| Judge | Node runner service + per-language Docker sandboxes (seccomp, cgroups) |
| Storage | Local filesystem or Cloudflare R2 (S3-compatible) |
| Observability | Sentry (optional), structured logging |
| AI | Anthropic Claude via `@anthropic-ai/sdk` (optional) |
| Testing | Vitest, fast-check (property tests), golden judge tests |

## Architecture

```
                ┌──────────────────────────┐
  Browser ─────▶│  Next.js web app (src/)  │──────▶ PostgreSQL
     ▲   SSE    │  pages · API · auth      │
     │          └──────┬─────────────┬─────┘
     │   WebSocket     │ enqueue     │ publish
     │                 ▼             ▼
     │          ┌────────────┐   ┌────────┐
     │          │   Redis    │◀──│ ticks  │  contest · standings · ratings ·
     │          │  (BullMQ)  │   └────────┘  analytics · notify · webhooks …
     │          └─────┬──────┘
     │                ▼
     │          ┌────────────┐      ┌─────────────────────────┐
     └──────────│  runner/   │◀─────│ worker/ (judge workers) │
                │  sandboxes │      └─────────────────────────┘
                └────────────┘
```

- **`src/`** — the Next.js app: UI routes, API routes, and the shared judge
  engine in `src/lib/judge/` used by both the synchronous and queued paths.
- **`runner/`** — compiles and executes untrusted code in hardened Docker
  containers. See [`runner/README.md`](runner/README.md).
- **`worker/`** — BullMQ consumers and scheduled "tick" processes. See
  [`worker/README.md`](worker/README.md).
- **`prisma/`** — schema, migrations and seeds (institutions, tags, badges, admin).

## Project structure

```
.
├── src/
│   ├── app/          # Next.js routes (pages + /api)
│   ├── components/   # React components
│   ├── i18n/         # English + Bangla dictionaries
│   └── lib/          # Domain logic: auth, judge, scoring, contests, ai, …
├── runner/           # Sandboxed code-execution service + language images
├── worker/           # Queue workers and scheduled ticks
├── prisma/           # Schema, migrations, seeds
├── tests/            # Integration and golden (judge conformance) tests
├── scripts/          # Problem-bank build, load tests, checks, migrations
├── data/             # Problem bank sources
└── docs/             # Master plan, phase briefs, runbook, DR, capacity
```

## Quick start

### Prerequisites

- **Node.js 20+** (CI uses Node 22)
- **PostgreSQL 16** (local install or a hosted provider such as Neon)
- **`gcc` or `clang`** — for the local C judge fallback
- **Docker** — optional; needed for Redis, the judge worker and the sandboxed runner

### 1. Clone and install

```bash
git clone https://github.com/0xdevabir/contest.git codehub
cd codehub
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

At minimum set:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string (pooled, if your provider pools) |
| `DIRECT_URL` | Non-pooled connection for migrations — same as `DATABASE_URL` for a plain Postgres |
| `AUTH_SECRET` | Session signing key — `openssl rand -base64 32` |
| `APP_URL` / `NEXT_PUBLIC_APP_URL` | Public site URL, e.g. `http://localhost:3000` |
| `SMTP_*` | Mail settings for verification and password-reset emails |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Initial admin account for the seed (password ≥ 12 chars) |

### 3. Set up the database

```bash
npm run db:deploy   # apply migrations
npm run db:seed     # institutions, tags, badges + admin user
```

No default admin password exists — the seed uses the values from `.env`. It is
safe to re-run; it only inserts what's missing.

### 4. Run

```bash
npm run dev
```

Open <http://localhost:3000>.

### Optional: judge queue, workers and sandboxed runner

```bash
docker compose up redis                    # Redis on :6379
# add REDIS_URL="redis://localhost:6379" and FLAGS_JUDGE_QUEUE=1 to .env
npm run worker:dev                         # judge worker (separate terminal)
```

For the interactive, sandboxed runner, follow [`runner/README.md`](runner/README.md)
and set `RUNNER_TOKEN` / `NEXT_PUBLIC_RUNNER_URL`.

## Configuration

Every variable is documented inline in [`.env.example`](.env.example). Highlights:

| Area | Variables |
|---|---|
| Execution backends | `RUNNER_TOKEN`, `NEXT_PUBLIC_RUNNER_URL`, `JUDGE0_URL`, `JUDGE0_KEY` |
| Queue & workers | `REDIS_URL`, `JUDGE_SHARED_SECRET`, `WORKER_CONCURRENCY` |
| Storage | `BLOB_DRIVER` (`fs` or `s3`), `R2_*` |
| Error tracking | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` |
| AI layer | `ANTHROPIC_API_KEY` |
| Alerting & autoscale | `SLO_ALERT_EMAIL`, `TELEGRAM_*`, `HETZNER_*` |

**Feature flags** — each subsystem can be toggled with `FLAGS_<NAME>="1"` / `"0"`
(e.g. `FLAGS_JUDGE_QUEUE`, `FLAGS_CLASSROOM`, `FLAGS_RATINGS`). Env overrides take
precedence over the `FeatureFlag` database table.

> [!WARNING]
> `ALLOW_INSECURE_LOCAL_JUDGE` runs student code **without a sandbox**. Never
> enable it on a server reachable by untrusted users.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Generate Prisma client and build for production |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript `--noEmit` |
| `npm run verify` | Typecheck + lint + tests + i18n + contrast checks |
| `npm run db:migrate` | Create and apply a migration (interactive, local dev) |
| `npm run db:deploy` | Apply pending migrations (non-interactive, CI/prod) |
| `npm run db:seed` | Seed institutions, tags, badges and the admin user |
| `npm run db:studio` | Browse data in Prisma Studio |
| `npm run bank:build` | Rebuild the problem bank from `data/` |
| `npm run worker:dev` | Judge worker (watch mode) |
| `npm run <name>-tick:dev` | Scheduled ticks: `contest`, `standings`, `ratings`, `analytics`, `leaderboard`, `notify`, `autoscale`, `slo-alert`, `recommend` |
| `npm run loadtest` / `loadtest:live` | Contest load tests |

Each worker/tick also has a `:start` variant for production.

> [!CAUTION]
> `npm run db:push:danger` (raw `prisma db push`) bypasses migration history.
> Use it only for throwaway local experiments. If `prisma migrate status` ever
> reports drift, see [`docs/RUNBOOK.md`](docs/RUNBOOK.md).

## Testing

```bash
npm test               # unit + integration tests
npm run test:watch     # watch mode
npm run test:golden    # judge conformance/security cases (needs Docker sandbox images)
npm run verify         # everything CI checks, locally
```

- Integration tests run when `TEST_DATABASE_URL` points at a throwaway database;
  otherwise only the unit tier runs.
- Queue tests self-skip unless `REDIS_URL` is set.
- CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs typecheck, lint,
  tests with coverage and a production build against Postgres 16 and Redis 7 on
  every push and pull request. Golden judge tests run on changes to `runner/` or
  `src/lib/judge/`, nightly, or with `[judge]` in the commit message.

## Deployment

The judge needs a Docker daemon and cgroups, so it can't run on serverless hosts.
The recommended topology:

| Component | Where |
|---|---|
| Web app (`next build && next start`) | Any Node host, or Vercel |
| PostgreSQL | Managed Postgres (e.g. Neon) or self-hosted |
| Redis | Managed or self-hosted Redis 7 |
| `runner/` + `worker/` | A Linux VPS with Docker (4 vCPU / 8 GB handles a lab-sized contest) |

Remember that `NEXT_PUBLIC_*` variables are inlined at build time — rebuild after
changing them. With `BLOB_DRIVER="fs"`, mount a persistent volume at `.data/blobs`.
See [`worker/README.md`](worker/README.md), [`docs/CAPACITY.md`](docs/CAPACITY.md)
and [`docs/DR.md`](docs/DR.md).

## Documentation

| Document | Contents |
|---|---|
| [`docs/README.md`](docs/README.md) | Documentation index and phase overview |
| [`docs/ULTIMATE_PLAN.md`](docs/ULTIMATE_PLAN.md) | Vision, architecture, domain model and roadmap |
| [`docs/phases/`](docs/phases/) | Detailed brief for each delivered phase |
| [`docs/RUNBOOK.md`](docs/RUNBOOK.md) | Operational alerts: meaning, diagnosis, fix |
| [`docs/CAPACITY.md`](docs/CAPACITY.md) | Measured judge throughput and sizing |
| [`docs/DR.md`](docs/DR.md) · [`docs/DR-DRILL.md`](docs/DR-DRILL.md) | Disaster recovery plan and drill log |
| [`docs/PARTITIONING.md`](docs/PARTITIONING.md) | Table partitioning strategy |
| [`docs/ACCESSIBILITY.md`](docs/ACCESSIBILITY.md) | WCAG conformance notes |
| `/developers` (in-app) | Public API reference |

## Contributing

Contributions are welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md) for the
workflow and conventions. Please report security issues privately as described
in [`SECURITY.md`](SECURITY.md).

## License

Released under the [MIT License](LICENSE). © 2026 Md Abir Hossain.

<div align="center">
<sub>Built for the students and teachers of Daffodil International University and beyond.</sub>
</div>
