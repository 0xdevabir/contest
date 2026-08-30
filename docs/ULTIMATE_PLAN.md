# ContestHub — Master Plan (v2)

> **Status**: living document. Supersedes `docs/archive/ULTIMATE_PLAN-v1-sonnet.md`.
> **Last revised**: 2026-08-30.
>
> **How to use this file**: this is the *why* and the *shape*. The *how* lives in
> `docs/phases/PHASE-NN-*.md` — one self-contained, executable brief per phase.
> To start work, say **"execute Phase N"**; that phase file alone contains
> everything needed (schema diff, migration steps, file manifest, API contracts,
> tests, acceptance criteria, rollback). Keep both this file and the phase file
> updated as reality diverges from the plan.

---

## Table of contents

1. [What this is](#1-what-this-is)
2. [Honest baseline: what exists today](#2-honest-baseline-what-exists-today)
3. [Critical findings in the current code](#3-critical-findings-in-the-current-code)
4. [Product vision](#4-product-vision)
5. [Personas and jobs-to-be-done](#5-personas-and-jobs-to-be-done)
6. [The differentiators](#6-the-differentiators)
7. [Design principles](#7-design-principles)
8. [Target architecture](#8-target-architecture)
9. [Domain model overview](#9-domain-model-overview)
10. [The roadmap](#10-the-roadmap)
11. [Sequencing rationale and dependency graph](#11-sequencing-rationale-and-dependency-graph)
12. [Non-goals](#12-non-goals)
13. [Appendices](#13-appendices)

---

## 1. What this is

ContestHub is a **competitive-programming judge + classroom practice platform for
Bangladeshi universities**. It merges three products that today are separate:

| Product it replaces | What we take from it |
|---|---|
| **Toph / Codeforces** | Public contests, ratings, an open problem archive solvable without an account, editorials, virtual participation |
| **vJudge** | Anyone can spin up a contest in minutes — public or password-gated — over a shared problem pool |
| **Google Classroom / an LMS** | Courses, sections, rosters, assignments with due dates, a gradebook, per-student performance tracking |

None of the three does the union well. Toph has no classroom. vJudge has no
first-class problem authoring or analytics. An LMS cannot judge code. A teacher
running a CSE lab in Dhaka today juggles all three plus a spreadsheet.

**The wedge is the teacher.** Students follow their courses. Win the teacher and
the whole section arrives with them — including the students who would never sign
up for a contest site on their own. Every architectural decision in this plan is
biased toward *teacher-in-the-loop practice management sitting on top of a
genuinely good judge*.

**The moat is national scope.** A per-university leaderboard is a feature. A
verified national leaderboard across every university in Bangladesh — with
inter-university seasons — is a network effect that gets harder to displace every
semester it runs.

---

## 2. Honest baseline: what exists today

Measured against the repo at commit `b7ee204`, ~16,700 lines of TypeScript/TSX.

### What is genuinely good and should be preserved

- **Next.js 15 App Router + React 19 + TypeScript + Tailwind 4 + Prisma 6 / Neon.**
  A modern, coherent stack. No rewrite is warranted anywhere in this plan.
- **The admin command center is real** — analytics, user management, submission
  inspection, system health, `AdminAuditLog`. Most projects at this stage have a
  stub. This one is a working product surface and the audit-log pattern should be
  generalized, not replaced.
- **The Docker sandbox (`runner/sandbox.js`) is properly hardened.**
  `--network none`, `--memory` + `--memory-swap` equal (no swap escape),
  `--pids-limit 128`, `--cap-drop ALL`, `--security-opt no-new-privileges`,
  `--read-only` rootfs, tmpfs work dirs, non-root uid 10001. Whoever wrote this
  understood the threat. It is the right foundation for Judge v2.
- **Contest scoring already works**, including scoreboard freeze — v1 of the plan
  claimed freeze was unwired; it is in fact implemented in
  `contest-dashboard.ts:169-173,244` and surfaced in `ContestClock.tsx`.
  `buildContestDashboard` is also a **pure function** taking injected data, which
  is exactly the shape needed to swap in pluggable scoring engines later.
- **The 700-problem bank** with 7 difficulty tiers × 20 sets is a real content
  asset. Most judges launch empty. This one launches with inventory.
- **Auth is deliberate** — `jose` JWT, bcrypt, email verification, an 8-digit
  reset-code flow, per-user theme/editor preferences, profile privacy toggles.
- **SEO and PWA scaffolding** already exist (`sitemap.ts`, `robots.ts`,
  `manifest.ts`, OG images, JSON-LD via `seo.tsx`).

### What blocks the vision

| Gap | Why it blocks |
|---|---|
| `University` is a 4-value Postgres **enum** (DIU, NSU, AIUB, BRAC) | A national leaderboard needs ~150 institutions. An enum means a migration for every new university, and no place to store district, logo, or verified email domains. |
| **No `Problem` table.** Problems live in `data/problems.json`; `ContestProblem.problemId` and `Submission.problemId` are unconstrained strings | Teachers cannot author problems. No tags, no per-problem analytics, no editorials, no referential integrity, no rejudge. Nearly every later feature depends on problems being rows. |
| `Role` is `USER \| ADMIN` | No teacher. No TA. No coach. |
| **Judging is synchronous inside the request handler** | The web request blocks for the full compile+run. 50 concurrent submitters during a midterm will saturate the Node event loop and time out the platform, not just the judge. |
| **C only**, hardcoded in five places | Excludes every C++/Python/Java course — i.e. most of the CS curriculum after semester 1. |
| No classes, courses, sections, enrollments, or assignments | The entire classroom half of the product does not exist. |
| Contests have no visibility axis | Every contest is public. A teacher's quiz would appear on the public contests page. |
| No queue, no Redis, no object storage, no worker tier | Nowhere to put work that must not run in a web request. |
| `Submission` stores `code`, `stdout`, `stderr` inline as `text` | The hottest, largest table on the platform carries multi-KB blobs in every row. Analytics scans get slow at a few hundred thousand rows. |
| No automated tests beyond two ad-hoc `scripts/check-*.ts` | Fifteen phases of change on an untested base is how a platform dies. |

---

## 3. Critical findings in the current code

These are not roadmap items; they are defects. **Phase 0 fixes all four before any
feature work.** Listed most severe first.

### F-1 — Untrusted student code inherits the server's entire environment (High)

`src/lib/judge.ts` → `runProcess()` spawns with `env: process.env`. The compiled
student binary therefore has `DATABASE_URL`, `AUTH_SECRET`, `SMTP_PASS`,
`RUNNER_TOKEN` and every other secret in its environment. A three-line C program
prints them:

```c
#include <stdlib.h>
#include <stdio.h>
int main(){ printf("%s\n", getenv("DATABASE_URL")); }
```

The output is returned to the submitter in the `stdout` field of the judge
response. This path is the **default**: `runnerJudgeUrl()` returns `null` unless
both `NEXT_PUBLIC_RUNNER_URL` and `RUNNER_TOKEN` are set, and `remoteJudgeUrl()`
needs `JUDGE0_URL` — both empty in `.env.example`. Any deployment that has not
explicitly wired a runner leaks its database credentials to any student who
submits.

**Fix (Phase 0)**: pass an explicit minimal env (`{ PATH, LANG, HOME }`), and
make the in-process local judge refuse to start unless
`ALLOW_INSECURE_LOCAL_JUDGE=1` is set, so production cannot silently fall into it.

### F-2 — Anonymous, unauthenticated, unmetered code execution (High)

`POST /api/judge` with `mode: "run"` executes arbitrary submitted code **before
any session check** and with no rate limit, no per-IP quota, and no captcha. Same
for the interactive terminal path via `/api/run-ticket`. "Solve without login" is
a deliberate and good product decision, but as implemented it is a free compute
faucet: trivially scriptable into a crypto-miner host or a DoS amplifier, and each
run holds a Node worker for up to the time limit.

**Fix (Phase 0)**: per-IP and per-session token buckets in Redis, a hard global
concurrency cap on anonymous runs, shorter limits for anonymous work, and
anonymous jobs at the back of the queue once Phase 4 lands.

### F-3 — `MLE` is a verdict the judge can never produce (Medium)

`Verdict.MLE` exists in the Prisma enum, is rendered in `ProblemWorkspace.tsx`,
`ContestDashboard.tsx`, admin filters, and is even advertised in the marketing
copy on the homepage — but **no code path measures memory**. `Problem.memoryLimitMb`
is declared in `types.ts` and read by nothing. The container has a memory cap, so
an over-limit program is OOM-killed and reported as `RE`, which sends the student
debugging the wrong thing.

**Fix (Phase 0 partial, Phase 3 complete)**: read the cgroup
`memory.events` / `oom_kill` counter after each run and map to `MLE`; thread
`memoryLimitMb` from the problem through to the sandbox.

### F-4 — Only the first test's telemetry is persisted (Medium)

`persistSubmission()` in `api/judge/route.ts` writes `result.results[0]`'s
`timeMs`/`stdout`/`stderr`. On an `AC` over 20 tests, the recorded time is test 1's
— not the max — so "fastest solution" rankings and TLE-margin analytics are wrong.
On a `WA` the loop breaks early so index 0 happens to be right, which is why this
has not been noticed.

**Fix (Phase 0)**: persist `max(timeMs)` and the *failing* test's output; store the
full per-test report as a `JudgeReport` JSON column ahead of the Phase 3 schema.

---

## 4. Product vision

> **One account, from a student's first `printf` to their ICPC regional — and the
> teacher can see all of it.**

Three surfaces, one judge underneath:

**A. The open archive** — thousands of problems, solvable by anyone with no
account, in any supported language. Progress is kept in the browser for guests and
**claimed into the account on signup** so nothing is lost. This is the top of the
funnel and the SEO engine.

**B. The contest platform** — public rated contests, private password-gated
contests, class-scoped assignments, ICPC-style team contests, virtual
participation on any past contest, and a permanent gym. Ratings roll up into
per-institution and **national** leaderboards, organised into seasons.

**C. The classroom** — a teacher creates a course section, imports a roster from
CSV, publishes weekly assignments and timed lab quizzes, watches a live heatmap of
who is stuck on what, gets automatic plagiarism triage, and exports a gradebook
that opens cleanly in Excel. Semester ends, they clone the whole course for the
next batch.

### The three-year arc

| Horizon | Milestone |
|---|---|
| **Year 1** | DIU runs every CSE lab on it. 4 partner universities on public contests. Judge handles 500 concurrent submitters. |
| **Year 2** | 25+ institutions. A national inter-university league with seasons. Teacher-authored problems outnumber the seed bank. |
| **Year 3** | The default judge for CS education in Bangladesh. Official ICPC Dhaka-site prep platform. Public API with third-party integrations. |

---

## 5. Personas and jobs-to-be-done

| Persona | Their job | What they need that today's system lacks |
|---|---|---|
| **Guest** (Rafi, 1st sem, no account) | "Let me try one problem before I commit to signing up." | Guest progress that survives a refresh and transfers on signup; non-C languages |
| **Student** (Nusrat, 3rd sem) | "Practice for my midterm, see where I rank, don't lose my history." | Assignments with deadlines, a rating, a public profile worth linking on a CV |
| **Teacher** (Karim, lecturer) | "Run this week's lab, grade it automatically, and tell me who is falling behind." | Everything — the role does not exist |
| **TA** (Sadia, senior student) | "Answer clarifications and mark the manual parts, without being able to change grades." | Scoped, non-destructive delegated permissions |
| **Coach** (ICPC club) | "Track my squad across contests, run team practice on ICPC rules." | Team contests, squad dashboards |
| **Setter** (a strong student writing problems) | "Author a problem, get it reviewed, see it used." | Authoring, review workflow, attribution |
| **Admin** | "Keep it up, keep it fair, keep it cheap." | Queue visibility, plagiarism triage, cost telemetry, DR |

---

## 6. The differentiators

Beyond the original brief. Ordered by defensibility, not by build order.

1. **Verified national leaderboard.** Institution identity proven by email domain
   (`@diu.edu.bd` → verified DIU) or admin approval. Ranking is only interesting
   if it is trustworthy; domain verification is what makes it trustworthy.
   *(Phase 1, 9)*
2. **Per-student parameterised exam variants.** Every student in a lab quiz gets
   the *same problem with different constants* — different bounds, different
   sample data, generated from one template with a reference solution that
   produces each variant's expected output. Copying a neighbour's answer produces
   `WA`. No other platform in this space does this, and it is the single strongest
   argument a teacher can be given for moving an exam online. *(Phase 10, 15)*
3. **Course → section → assignment → gradebook**, not "a contest with a due date".
   Assignments have per-student deadlines, late penalties, and manual-mark
   columns. Contests have one clock. Conflating them, as most judges do, is why
   teachers end up back in a spreadsheet. *(Phase 6)*
4. **A real problem-setting pipeline** — proposal → review → validated test data →
   reference solutions must pass → brute-force cross-check → published. The
   difference between a judge and a toy is whether a broken test case can reach a
   student. *(Phase 2)*
5. **Fingerprint-indexed plagiarism**, computed at judge time, so similarity search
   over a whole semester is an index lookup rather than an O(n²) end-of-contest
   batch. Cross-semester and cross-section comparison comes free. *(Phase 10)*
6. **Bangla-first content.** Statements in both languages, Bangla UI. A first-year
   student in a Bangla-medium background can use this and cannot use Codeforces.
   *(Phase 14)*
7. **Adaptive practice ladder.** Problem difficulty derived from *actual solve
   data* (an ELO per problem), not the author's guess, then matched to the
   student's per-tag accuracy to recommend the next problem. *(Phase 15)*
8. **AI-assisted teacher tooling** — generate test data from a reference solution,
   draft an editorial, produce variant parameterisations, summarise a cohort's
   weak topics, and give a student a *hint* about their WA without giving the
   answer. Removes the biggest cost of running a course: authoring. *(Phase 15)*
9. **Team contests + coach dashboards** for ICPC/NCPC preparation. *(Phase 7)*
10. **Verifiable certificates and a public CP transcript** a student can put on a
    CV with a QR that resolves to a signed record. Cheap; disproportionate
    perceived value. *(Phase 9)*
11. **Lab kiosk / offline-tolerant mode.** University labs have flaky wifi. Cache
    statements, queue submissions locally, sync on reconnect. *(Phase 14)*
12. **Federated remote judging** (vJudge-style adapters for Codeforces/AtCoder)
    so a coach can run practice over problems we do not host. High legal and
    operational risk — explicitly scoped and gated. *(Phase 12)*

---

## 7. Design principles

These resolve arguments before they happen. When a phase brief contradicts one of
these, the principle wins and the brief is wrong.

1. **The judge is the product.** A wrong verdict costs more trust than a missing
   feature. Correctness, determinism and reproducibility beat throughput, which
   beats latency, which beats features.
2. **Data over declaration.** Anything that varies — languages, verdicts, scoring
   rules, institutions, badges — is a row or a registry entry, never a `switch`
   in five files. Adding Rust must be a config entry, not a pull request across
   the codebase.
3. **Pure core, imperative shell.** Scoring, ranking, rating and plagiarism math
   are pure functions over injected data (as `buildContestDashboard` already is).
   They get property tests. I/O lives at the edges.
4. **Immutability where it is graded.** Published problem versions, final
   standings snapshots and rating events are append-only. A teacher must be able
   to answer "what exactly did the scoreboard say at 3:47pm" six months later.
5. **Expand → backfill → contract.** Every schema migration ships in three
   deploys, never one. No migration takes a write lock on `Submission`.
6. **Every phase ships behind a flag** and is reversible without a database
   restore.
7. **Assume the code is hostile, and assume the user is too.** Untrusted execution
   is network-isolated, resource-capped, secret-free, and metered. Every anonymous
   entry point has a quota.
8. **Solve at the lowest sufficient level.** Postgres `tsvector` before
   Elasticsearch. A Redis sorted set before a stream processor. A cron before an
   event bus. Ship the boring thing; earn the complex thing with a measured
   bottleneck.
9. **Bangladesh-first constraints.** Assume 3G, mid-range Android, intermittent
   power, and a cost ceiling that a university department can actually approve.

---

## 8. Target architecture

### 8.1 Topology

```
                        ┌─────────────────────────────────┐
   Browser ─────────────│  Next.js 15 (Vercel)            │
   (student/teacher)    │  App Router · RSC · Server Acts │
                        │  API routes · SSE endpoints     │
                        └───┬─────────┬─────────┬─────────┘
                            │         │         │
          ┌─────────────────┘         │         └──────────────────┐
          │                           │                            │
   ┌──────▼───────┐          ┌────────▼────────┐          ┌────────▼────────┐
   │ Neon Postgres│          │ Redis (Upstash) │          │ Object storage  │
   │ primary OLTP │          │ · BullMQ queues │          │ (Cloudflare R2) │
   │ + read replica│         │ · rate limits   │          │ · test data     │
   └──────────────┘          │ · live boards   │          │ · statement img │
                             │ · pub/sub SSE   │          │ · submission src│
                             └────────┬────────┘          └─────────────────┘
                                      │ jobs
                    ┌─────────────────▼──────────────────┐
                    │  Judge worker tier (Hetzner/Fly)   │
                    │  Node worker → Docker sandbox pool │
                    │  one warm container per language   │
                    └────────────────────────────────────┘
```

**Non-negotiable ops fact**: judge workers **cannot run on Vercel**. They need a
Docker daemon, long-lived processes and cgroup access. The worker tier is a
separate deployable on a plain VPS. This is the single biggest infrastructure
change in the plan and it is why Phase 4 exists as its own phase.

### 8.2 Services and their responsibilities

| Service | Owns | Never does |
|---|---|---|
| **Web (Next.js)** | Rendering, auth, authorisation, validation, enqueueing, reading results | Compile or execute untrusted code; long CPU work |
| **Judge worker** | Compile, run, check, report verdicts, compute fingerprints | Authorisation decisions; user-facing formatting |
| **Scheduler** (cron) | Contest lifecycle transitions, rating computation, digest emails, stats rollups, plagiarism sweeps | Anything latency-sensitive |
| **Postgres** | Source of truth for all durable state | Store large blobs (>64 KB) |
| **Redis** | Queues, live standings, rate limits, pub/sub, hot caches | Be a source of truth — everything in Redis must be rebuildable from Postgres |
| **R2** | Test data, statement assets, submission source archive, exports | Serve unauthenticated hot paths without a signed URL |

### 8.3 Runtime boundaries

- **Web → worker** is a queue message. Never an HTTP call the web request waits on.
- **Worker → web** is a database write plus a Redis pub/sub event. The worker never
  calls back into the web app.
- **Browser → live updates** is SSE over a Redis subscription, with polling as the
  documented fallback (Vercel caps streaming duration; the client reconnects).

---

## 9. Domain model overview

Full field-level definitions live in each phase brief; this is the map.

```
Institution ──< Department ──< Course ──< CourseSection ──< Enrollment >── User
     │                                          │
     │                                          └──< Assignment ──< AssignmentProblem
     └──< User                                          │
                                                        └──< Submission

User ──< Submission >── Problem ──< ProblemVersion ──< TestGroup ──< TestCase
  │          │                │
  │          │                └──< ProblemTag >── Tag
  │          └──< SubmissionFingerprint
  │
  ├──< ContestParticipation >── Contest ──< ContestProblem >── ProblemVersion
  │                                 │
  │                                 ├──< ContestAnnouncement
  │                                 ├──< ContestClarification
  │                                 └──< ContestStandingSnapshot
  │
  ├──< RatingEvent          ├──< UserBadge >── Badge
  ├──< Notification         ├──< Team >── TeamMember
  └──< ApiKey               └──< ProctorEvent
```

### Entities that do not exist today and are load-bearing

| Entity | Introduced | Why it is structural, not incidental |
|---|---|---|
| `Institution` | Phase 1 | Replaces the enum; carries verification domains. Every leaderboard groups by it. |
| `Problem` / `ProblemVersion` | Phase 2 | Versioning makes rejudge safe and past contests reproducible. A contest pins a version. |
| `TestGroup` | Phase 2 | Subtasks and partial scoring are impossible without a grouping level between problem and test. |
| `ContestParticipation` | Phase 5 | One model for live / virtual / practice participation. Three separate models means three copies of the scoreboard logic. |
| `ContestStandingSnapshot` | Phase 5 | Immutable final standings — required input to rating, and the answer to "what did the board say". |
| `SubmissionFingerprint` | Phase 10 | Turns plagiarism detection from a batch job into an index lookup. |
| `CourseSection` | Phase 6 | Same course, many sections, many semesters. Flattening this into "a class" breaks at the first semester rollover. |

---

## 10. The roadmap

Sixteen phases. Each ships a working increment behind a flag. Effort is in
**focused engineering days for one developer**; multiply by your own factor.

| # | Phase | Ships | Days | Brief |
|---|---|---|---|---|
| **0** | Foundation & Safety Net | Security hotfixes (F-1…F-4), test harness, CI, migration discipline, feature flags, error tracking | 6–8 | [PHASE-00](phases/PHASE-00-foundation.md) |
| **1** | Identity, Institutions & RBAC | `Institution` table, `Role` expansion (STUDENT/TEACHER/TA/ADMIN), teacher approval, domain verification, session hardening | 8–10 | [PHASE-01](phases/PHASE-01-identity-institutions.md) |
| **2** | Problem Domain | `Problem`/`ProblemVersion`/`TestGroup`/`TestCase`, R2 test data, tags, 700-bank import, authoring UI, setter workflow | 14–18 | [PHASE-02](phases/PHASE-02-problem-domain.md) |
| **3** | Judge v2 — Engine | Language registry, hardened multi-language sandbox, CPU-time + MLE + OLE, checkers, validators, interactors | 12–16 | [PHASE-03](phases/PHASE-03-judge-engine.md) |
| **4** | Judge v2 — Queue & Realtime | Redis + BullMQ, worker tier, SSE verdicts, rejudge, guest quotas, queue observability | 10–14 | [PHASE-04](phases/PHASE-04-judge-queue.md) |
| **5** | Contest Engine v2 | Participation model, pluggable scoring (ICPC/IOI/CF/exam), visibility × join policy, snapshots, clone | 12–16 | [PHASE-05](phases/PHASE-05-contest-engine.md) |
| **6** | Classroom & Courses | Department/Course/Section/Enrollment, roster import, assignments, late policy, gradebook, semester rollover | 14–18 | [PHASE-06](phases/PHASE-06-classroom.md) |
| **7** | Live Contest Experience | Clarifications, announcements, realtime standings, team contests, balloons, printing, coach view | 10–14 | [PHASE-07](phases/PHASE-07-live-contest.md) |
| **8** | Analytics & Reporting | Class heatmap, per-tag mastery, at-risk detection, student deep-dive, CSV/PDF exports | 10–12 | [PHASE-08](phases/PHASE-08-analytics.md) |
| **9** | Ratings, Leaderboards & Gamification | Elo-MMR ratings, national + institution boards, seasons, badges, streaks, certificates | 10–14 | [PHASE-09](phases/PHASE-09-ratings-leaderboards.md) |
| **10** | Academic Integrity | Winnowing fingerprints, similarity console, proctoring-lite, exam variants, session binding | 12–16 | [PHASE-10](phases/PHASE-10-integrity.md) |
| **11** | Community & Notifications | Editorials, discussions, notification centre, email + web push, moderation | 10–12 | [PHASE-11](phases/PHASE-11-community.md) |
| **12** | Platform API & Federation | Public REST API, API keys, webhooks, Polygon import, remote-judge adapters, embeds | 10–14 | [PHASE-12](phases/PHASE-12-platform-api.md) |
| **13** | Scale, Performance & Operations | Read models, caching, `Submission` payload offload + partitioning, load tests, SLOs, DR drills | 10–14 | [PHASE-13](phases/PHASE-13-scale-ops.md) |
| **14** | Localization, A11y & PWA | Bangla UI + bilingual statements, WCAG AA, offline lab mode, push | 8–12 | [PHASE-14](phases/PHASE-14-i18n-pwa.md) |
| **15** | Intelligence Layer | AI test-data generation, editorial drafting, exam variants, adaptive ladder, hint bot | 12–16 | [PHASE-15](phases/PHASE-15-intelligence.md) |

**Total: ~170–220 focused days.** Phases 0–5 (~62–82 days) are the backbone; the
platform is genuinely usable by a department after Phase 6.

### Release milestones

| Milestone | After phase | What you can honestly claim |
|---|---|---|
| **M1 — Safe** | 0 | No secret leakage, no free compute faucet, changes are tested |
| **M2 — Multi-tenant** | 1 | Teachers exist; any Bangladeshi university can be added without a migration |
| **M3 — Authorable** | 2 | A teacher writes their own problem with real test data |
| **M4 — Polyglot & scalable** | 4 | C/C++/Python/Java judged asynchronously; a 200-student lab does not fall over |
| **M5 — Classroom-ready** | 6 | A full semester of one course runs end-to-end on the platform |
| **M6 — Competition-ready** | 9 | Rated public contests, national leaderboard, team contests |
| **M7 — Exam-safe** | 10 | A teacher can defend a graded online exam |
| **M8 — Platform** | 12 | Third parties build on it |

---

## 11. Sequencing rationale and dependency graph

```
0 ──┬─> 1 ──┬─> 2 ──┬─> 3 ──> 4 ──┬─> 5 ──┬─> 6 ──┬─> 8
    │       │       │             │       │       │
    │       │       │             │       ├─> 7   └─> 10
    │       │       │             │       │
    │       │       │             │       └─> 9
    │       │       └─────────────┼─> 11
    │       │                     └─> 12
    └───────┴─> 13 (continuous; formalised after 5)
                14 (any time after 6)
                15 (after 2 + 8)
```

**Why this order, and where it deliberately differs from plan v1:**

1. **Phase 0 exists at all.** v1 had no foundation phase. Fifteen phases of schema
   churn on a codebase with two ad-hoc check scripts and a credentials leak is
   negligent sequencing. Six days here saves weeks later.

2. **Institutions come before classes** (v1 never fixed the enum). The
   `University` enum → `Institution` table migration touches `User`, three
   leaderboard queries and every registration path. Do it while the table has
   hundreds of rows, not hundreds of thousands. It also unblocks the national
   leaderboard, which is the moat.

3. **The `Problem` table moves from v1's Phase 4 to Phase 2.** This is the most
   important resequencing in the document. `ContestProblem.problemId` and
   `Submission.problemId` are today free strings pointing at JSON. Tags,
   editorials, per-problem analytics, rejudge, plagiarism-by-problem, and
   difficulty ratings *all* need real rows. Building classes and private contests
   first (v1's order) means writing that code against the string-keyed model and
   then rewriting it. Migrate the keystone first.

4. **The judge splits into two phases** (v1 had one). Making the judge
   multi-language and hardening the sandbox (Phase 3) is a *correctness* project
   testable on one machine. Introducing Redis, a queue, a separate worker
   deployable and SSE (Phase 4) is an *infrastructure* project with new failure
   modes. Coupling them means you cannot tell which change broke a verdict. Split
   them and each is independently verifiable.

5. **Classroom lands after the contest engine**, because an assignment is a
   *scoring policy over a problem set* and reuses the Phase 5 scoring engine.
   Building the gradebook first means building a second scoring implementation.

6. **Integrity (10) follows classroom (6)**, not the other way round — plagiarism
   detection needs a cohort to compare within, and proctoring needs an exam to
   proctor.

7. **Performance (13) is continuous but formalised late.** Budgets are defined in
   Phase 0 and enforced in CI from then on; the dedicated phase is for the
   structural work (partitioning, read models) that only pays off at real volume.

8. **The intelligence layer is last** and depends on Phase 2 (structured problems
   with reference solutions) and Phase 8 (per-tag mastery signals). Doing it
   earlier produces a demo, not a feature.

### If you must go faster

Minimum viable classroom, dropping everything not on the critical path:
**0 → 1 → 2 → 3 → 4 → 5 → 6.** That is one department running real labs. Ship it,
get a semester of feedback, then re-derive the priority of 7–15 from what teachers
actually ask for.

---

## 12. Non-goals

Explicitly out of scope. Revisit only with evidence.

- **Webcam / video proctoring.** Privacy cost and infrastructure cost both
  exceed the benefit for university lab work. Tab-switch, paste-origin and
  fullscreen telemetry is the ceiling. *(Exam variants — differentiator #2 — are
  the better answer to the same problem.)*
- **Courtroom-grade plagiarism proof.** Winnowing similarity is a triage tool
  that ranks pairs for a human. It never auto-penalises.
- **A custom WYSIWYG editor.** Markdown + KaTeX + live preview.
- **A microservice split.** Two deployables (web, worker) plus managed
  infrastructure. Anything more is unearned at this scale.
- **Custom auth infrastructure.** The existing `jose` + bcrypt implementation
  stays; it gains refresh-token rotation and revocation, not a rewrite onto
  NextAuth.
- **A separate search cluster.** Postgres `tsvector` until measured pain.
- **Mobile native apps.** PWA first. Revisit after 10k MAU.
- ~~"Cap at five languages"~~ — **rejected from plan v1.** Once Phase 3 makes a
  language a registry entry plus a Dockerfile, adding Go or Rust is an afternoon.
  The real non-goal is *per-language special-casing anywhere in application code*.

---

## 13. Appendices

Cross-cutting specifications referenced by multiple phases. Kept here so phase
briefs stay executable rather than repeating shared context.

- **[A. Environment variable registry](#appendix-a--environment-variable-registry)**
- **[B. Verdict taxonomy](#appendix-b--verdict-taxonomy)**
- **[C. Judge protocol v1](#appendix-c--judge-protocol-v1)**
- **[D. Scoring engine contract](#appendix-d--scoring-engine-contract)**
- **[E. Security threat model](#appendix-e--security-threat-model)**
- **[F. Performance budgets & SLOs](#appendix-f--performance-budgets--slos)**
- **[G. Migration discipline](#appendix-g--migration-discipline)**
- **[H. Conventions](#appendix-h--conventions)**
- **[I. Cost model](#appendix-i--cost-model)**
- **[J. Decision log](#appendix-j--decision-log-adrs)**

---

### Appendix A — Environment variable registry

Single source of truth. Every phase that adds a variable adds a row here and to
`.env.example`. Grouped by phase of introduction.

| Variable | Phase | Required | Purpose |
|---|---|---|---|
| `DATABASE_URL` | — | yes | Neon pooled connection |
| `DIRECT_URL` | 0 | yes | Neon direct connection, for migrations only |
| `AUTH_SECRET` | — | yes | JWT signing |
| `APP_URL` / `NEXT_PUBLIC_APP_URL` | — | yes | Canonical origin |
| `SMTP_*` | — | yes | Transactional mail |
| `ALLOW_INSECURE_LOCAL_JUDGE` | 0 | no | Must be `1` to permit the in-process compiler path. Never set in production. |
| `SENTRY_DSN` | 0 | no | Error tracking |
| `FLAGS_*` | 0 | no | Per-feature kill switches (see Appendix H) |
| `REDIS_URL` | 4 | yes (from P4) | Queues, rate limits, pub/sub |
| `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | 2 | yes (from P2) | R2-compatible object storage |
| `BLOB_DRIVER` | 2 | no | `s3` (default) or `fs` for local dev |
| `JUDGE_WORKER_CONCURRENCY` | 4 | no | Parallel sandboxes per worker; default = cores − 1 |
| `JUDGE_SHARED_SECRET` | 4 | yes (from P4) | HMAC between worker and web for report writes |
| `SANDBOX_IMAGE_PREFIX` | 3 | no | e.g. `contesthub-sandbox-` → `contesthub-sandbox-cpp` |
| `ANON_RUN_RPM` / `ANON_RUN_BURST` | 0 | no | Anonymous execution quota |
| `ANTHROPIC_API_KEY` | 15 | no | Intelligence layer |
| `WEB_PUSH_PUBLIC_KEY` / `WEB_PUSH_PRIVATE_KEY` | 11 | no | VAPID keys |

### Appendix B — Verdict taxonomy

Final set after Phase 3. Existing values keep their meaning; new values are
additive so historical rows stay readable.

| Verdict | Meaning | Emitted by |
|---|---|---|
| `AC` | Accepted — all tests passed the checker | judge |
| `WA` | Wrong answer | checker |
| `PA` | *new* Partially accepted — some test groups passed (IOI scoring) | scorer |
| `CE` | Compile error | compiler |
| `RE` | Runtime error — non-zero exit or fatal signal | runner |
| `TLE` | Time limit exceeded — **CPU time**, wall time recorded separately | runner |
| `MLE` | Memory limit exceeded — cgroup OOM kill detected | runner *(never emitted today — see F-3)* |
| `OLE` | *new* Output limit exceeded | runner |
| `IE` | *new* Internal error — judge infrastructure fault, always retried | worker |
| `SKIP` | No automatic tests (open-ended problem) | web |
| `ERROR` | *deprecated* — retained for old rows; new rows use `IE` | — |
| `PENDING` | *new* Queued, not yet picked up | web |
| `JUDGING` | *new* Worker has claimed it | worker |

`IE` never counts as an attempt, never penalises, and is automatically retried up
to 3 times. Conflating infrastructure failure with a wrong answer is the fastest
way to lose a teacher's trust.

### Appendix C — Judge protocol v1

The versioned contract between web and worker. Frozen once Phase 4 ships;
breaking changes bump `protocol`.

```jsonc
// Job payload — web → queue → worker
{
  "protocol": 1,
  "submissionId": "clx...",          // idempotency key
  "kind": "submit" | "run" | "rejudge" | "validate",
  "language": "cpp20",               // key into the language registry
  "sourceRef": "r2://submissions/clx.../main.cpp",
  "limits": { "cpuMs": 2000, "wallMs": 6000, "memoryMb": 256, "outputKb": 512, "processes": 64 },
  "checker": { "type": "token" | "exact" | "float" | "special" | "interactive",
               "epsilon": 1e-6, "programRef": "r2://checkers/..." },
  "tests": [ { "group": 1, "index": 0, "inputRef": "r2://...", "expectedRef": "r2://..." } ],
  "policy": { "stopOnFirstFail": true, "revealSampleOutput": true },
  "priority": 0                      // 0 contest · 5 assignment · 10 practice · 20 anonymous
}
```

```jsonc
// Report — worker → Postgres + Redis pub/sub
{
  "protocol": 1,
  "submissionId": "clx...",
  "verdict": "WA",
  "score": 40,                       // 0..maxScore, group-weighted
  "compile": { "ok": true, "stderr": "", "ms": 412 },
  "groups": [ { "group": 1, "verdict": "AC", "score": 40, "points": 40 } ],
  "tests":  [ { "index": 0, "verdict": "AC", "cpuMs": 12, "wallMs": 15, "memoryKb": 3200 } ],
  "maxCpuMs": 1840, "maxMemoryKb": 12800,
  "fingerprint": "sha256:...",       // winnowing digest, Phase 10
  "judge": { "workerId": "w-3", "image": "contesthub-sandbox-cpp:2026-08-01", "durationMs": 2310 }
}
```

**Invariants**
- A worker writes a report **exactly once** per `(submissionId, attempt)`; the
  write is a conditional update guarded on `state = 'JUDGING'`.
- Reports are **idempotent**: replaying a report must not change the row.
- `stopOnFirstFail` is `false` for IOI-style and for teacher-facing rejudges — a
  teacher needs to see every failing test, not just the first.
- Sample test output is returned to the student; hidden test output never is —
  only the verdict, the CPU time and (optionally) the test index.

### Appendix D — Scoring engine contract

Every scoring mode is a pure function with the same signature. Phase 5 introduces
the interface and ports the existing ICPC logic onto it; Phase 6 adds `assignment`.

```ts
export type ScoringEngine = {
  id: "icpc" | "ioi" | "cf" | "assignment";
  score(input: {
    participation: Participation;      // mode, startedAt, endsAt, official
    problems: ContestProblemView[];    // points, groups, order
    submissions: ScoredSubmission[];   // verdict, score, at, groupResults
    rules: ContestRules;
    now: number;
  }): {
    total: number;
    penalty: number;
    perProblem: ProblemCell[];         // attempts, solvedAt, score, frozen
    tiebreak: number[];                // lexicographic, higher-is-better
  };
};
```

| Engine | Total | Penalty | Tiebreak | Use |
|---|---|---|---|---|
| `icpc` | solved count | `Σ(minutes + 20×wrong)` | −penalty, −lastAcMinute | Public + team contests |
| `ioi` | `Σ max(group score)` per problem | none | −totalTimeOfBest | Subtask problems, olympiad prep |
| `cf` | `Σ maxPoints × decay(t) − 50×wrong` | folded into total | −lastAcMinute | Rated public contests |
| `assignment` | `Σ (best × lateMultiplier) + manualMarks` | none | submission time | Course assignments |

Property tests these must satisfy (Phase 5): monotonicity (a later AC never
lowers a score), freeze-invariance (unfreezing only adds), determinism (same
inputs → same output), and rank stability under submission reordering.

### Appendix E — Security threat model

| Threat | Vector | Control | Phase |
|---|---|---|---|
| Secret exfiltration via submitted code | `env: process.env` (F-1) | Explicit minimal env; sandbox-only execution in prod | 0 |
| Resource abuse / cryptomining | Anonymous `mode: "run"` (F-2) | Redis token bucket per IP + session, global concurrency cap, queue deprioritisation, shorter anon limits | 0, 4 |
| Container escape | Kernel exploit from student code | Existing hardening + seccomp profile, gVisor evaluated in P3, workers on a dedicated host with no cloud metadata access | 3 |
| Network egress from submissions | Outbound socket in student code | `--network none` (already), plus egress-deny at the host firewall | 3 |
| Fork bomb / PID exhaustion | `fork()` loop | `--pids-limit` (already), `RLIMIT_NPROC` | 3 |
| Disk fill | Large file writes | tmpfs with size cap (already), `RLIMIT_FSIZE` | 3 |
| Test data theft | Student reads hidden tests | Tests injected per-run into tmpfs, deleted after; never in the image; hidden output never returned | 3 |
| Answer leakage via timing | Binary-searching hidden tests through verdicts | Submission rate limits per problem, `maxSubmissionsPerProblem` (exists) | 5 |
| Grade tampering | Direct API calls to scoring endpoints | Scores are never client-supplied; recomputed server-side from submissions | 5 |
| Identity fraud on the national board | Fake institution claims | Email-domain verification + admin approval + one-account-per-email | 1, 9 |
| Session hijack during an exam | Shared credentials | Single-active-session binding for strict contests; device fingerprint logged | 10 |
| Privilege escalation to TEACHER | Self-serve teacher signup | Teacher accounts require admin approval before any teacher capability activates | 1 |
| PII exposure | Public profiles, exports | Existing `profilePublic`/`showEmail` honoured everywhere; exports scoped to the requesting teacher's own sections | 1, 8 |
| Mass enumeration | Scraping users/problems | Cursor pagination, per-key API rate limits, no sequential IDs (cuid already) | 12 |

### Appendix F — Performance budgets & SLOs

Enforced in CI from Phase 0 (as assertions on synthetic data) and measured in
production from Phase 4.

| Surface | Budget | Notes |
|---|---|---|
| Problem page TTFB (cached) | ≤ 200 ms p95 | Statement is ISR-cached |
| Contest scoreboard render | ≤ 400 ms p95 at 500 participants | Read model, not live aggregation |
| Submit → `PENDING` acknowledged | ≤ 150 ms p95 | Enqueue only; no judging in the request |
| Submit → verdict (idle queue, C/C++) | ≤ 3 s p95 | 10 tests, 1 s limit each |
| Submit → verdict (contest peak) | ≤ 20 s p95 | Queue depth is the lever |
| Queue depth during a live contest | ≤ 2× worker concurrency sustained | Alert above |
| Judge availability | 99.5% monthly | `IE` rate < 0.5% of submissions |
| Scoreboard staleness | ≤ 5 s | SSE push |
| DB p95 query time | ≤ 50 ms | Any query above gets an index or a read model |
| Cold JS on 3G (student pages) | ≤ 180 KB gzipped | Monaco lazy-loaded only on the workspace |

### Appendix G — Migration discipline

Every schema change follows **expand → backfill → contract**, in three separate
deploys. This is not ceremony; it is the difference between a five-minute deploy
and a restore from backup during a live exam.

1. **Expand** — add nullable columns / new tables. Old code keeps working.
   Deploy. *No `NOT NULL`, no drops, no renames in this step.*
2. **Backfill** — a batched, resumable, idempotent script in `scripts/migrations/`
   that processes in chunks of ≤ 1000 rows with a progress cursor. Dual-write from
   application code during this window. Verify with a reconciliation query.
3. **Contract** — add constraints, drop the old columns, remove dual-writes.
   Deploy.

**Hard rules**
- Never `ALTER TABLE ... SET NOT NULL` on `Submission` without a validated
  `CHECK` constraint added `NOT VALID` first, then `VALIDATE CONSTRAINT`.
- Enum → table migrations (`University` → `Institution`, Phase 1) keep the enum
  column until the contract step and never drop it in the same release as the
  code that stops writing it.
- Every backfill script is runnable twice with the same result.
- Every migration has a written down-path in its phase brief. "Restore from
  backup" is an acceptable down-path only for contract steps.

### Appendix H — Conventions

**Feature flags.** `src/lib/flags.ts` exports `isEnabled(flag, ctx)`. Source
order: env `FLAGS_<NAME>` → DB `FeatureFlag` row (with optional
institution/role targeting) → default `false`. Every phase names its flag in the
brief and removes it in the following phase's cleanup step.

**Errors.** `src/lib/errors.ts` defines `AppError` subclasses
(`ValidationError`, `AuthError`, `ForbiddenError`, `NotFoundError`,
`ConflictError`, `RateLimitError`, `InternalError`), each with an HTTP status and
a stable `code`. API routes end in a single `toResponse(err)` helper. No route
hand-rolls a status code.

**Authorisation.** One module, `src/lib/authz.ts`, exporting
`can(actor, action, resource)`. Every route calls it. No route re-derives
"is this user allowed" from role checks inline — that pattern is how a TA ends up
able to change grades.

**Validation.** Zod at every boundary, schemas in `src/lib/validators/` split per
domain once the file exceeds ~200 lines.

**Naming.** Files `kebab-case.ts`; React components `PascalCase.tsx`; Prisma
models singular `PascalCase`; enum values `SCREAMING_SNAKE`; API routes plural
nouns; booleans read as assertions (`isPublic`, `hasStarted`).

**Tests.** `*.test.ts` beside the unit under test. Pure-logic tests are the
default; a test that needs a database uses the shared test-container helper and
must clean up. Judge conformance uses golden files in `tests/golden/`.

**Commits.** Conventional commits (`feat:`, `fix:`, `refactor:`, `perf:`,
`docs:`, `test:`, `chore:`), scoped by phase where useful (`feat(p3): ...`).

### Appendix I — Cost model

Monthly, USD, at three scales. Assumes Bangladesh-friendly providers and no
enterprise tiers.

| Component | 500 users | 5,000 users | 25,000 users |
|---|---|---|---|
| Vercel (web) | $0 (hobby) | $20 (pro) | $20–60 |
| Neon Postgres | $0 | $19 | $69 |
| Upstash Redis | $0 | $10 | $30 |
| Cloudflare R2 | $0 | $2 | $8 |
| Judge workers (Hetzner CX32, 4 vCPU) | $8 × 1 | $8 × 2 | $8 × 5 + burst |
| Sentry / logs | $0 | $0 | $26 |
| Email (SMTP → Resend) | $0 | $0 | $20 |
| **Total** | **~$8** | **~$67** | **~$210** |

The dominant scaling cost is judge CPU, and it is the one cost that is *lumpy* —
a 300-student midterm needs capacity for ten minutes a week. Phase 13 covers
autoscaling the worker tier on queue depth; until then, over-provision during
exam weeks and scale down after.

### Appendix J — Decision log (ADRs)

Append-only. New decisions get the next number; superseded decisions are marked,
not deleted.

| # | Decision | Rationale | Alternatives rejected |
|---|---|---|---|
| **1** | Keep custom JWT auth | Works, is understood, and the migration cost of NextAuth buys nothing we need | NextAuth/Auth.js, Clerk |
| **2** | `Institution` table, not an enum | National scope needs ~150 rows with metadata; enums need a migration per value | Keeping the enum; a string column |
| **3** | Problem versioning from day one | Rejudge safety and past-contest reproducibility are unachievable retrofitted | Mutable problems + audit log |
| **4** | Test data in object storage, metadata in Postgres | Keeps the OLTP database small and fast; test files are write-once/read-many blobs | `bytea` columns; a filesystem on the worker |
| **5** | BullMQ on Redis, not a managed queue | One dependency serves queue + rate limits + pub/sub + live boards | SQS, Cloud Tasks, `pg`-backed queue |
| **6** | Judge workers on a plain VPS, not serverless | Docker, cgroups and long-lived processes are non-negotiable for a sandbox | Vercel functions, Lambda, Fargate |
| **7** | Split judge into engine (P3) and queue (P4) | Correctness and infrastructure fail differently; debug them separately | One "judge v2" phase |
| **8** | Problem domain before classroom | Everything downstream keys off real problem rows | v1's order (classes first) |
| **9** | One `ContestParticipation` model for live/virtual/practice | Three models means three scoreboard implementations | Separate `VirtualParticipation` table |
| **10** | Scoring engines as pure pluggable functions | Property-testable; assignments and contests share one implementation | Branching inside `buildContestDashboard` |
| **11** | Assignments are not contests | Per-student deadlines and late policy do not fit a single contest clock | Reusing `Contest` with a `dueAt` |
| **12** | Fingerprints computed at judge time | Turns O(n²) batch similarity into an index lookup | End-of-contest batch job |
| **13** | SSE over WebSockets for live updates | One-directional, works through the existing HTTP stack, degrades to polling | Socket.io, Pusher |
| **14** | Postgres `tsvector` for search | Sufficient to ~10⁶ documents; zero new infrastructure | Elasticsearch, Typesense, Algolia |
| **15** | No language cap | Phase 3 makes a language a registry row + a Dockerfile | v1's "cap at 5 languages" non-goal |
| **16** | Exam variants over webcam proctoring | Solves the same problem with better privacy economics and no hardware requirement | Video proctoring, lockdown browser |

---

## Changelog

| Date | Change |
|---|---|
| 2026-08-30 | v2 master plan. Rewritten from v1 (archived). Added Phase 0; resequenced problem domain to Phase 2; split judge into P3/P4; added institutions, courses/sections, integrity, intelligence layer; added appendices A–J and four code findings. |
