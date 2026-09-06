# CodeHub Documentation

## Start here

| Document | What it is |
|---|---|
| **[ULTIMATE_PLAN.md](ULTIMATE_PLAN.md)** | The master plan — vision, baseline, architecture, domain model, roadmap, and cross-cutting specs (appendices A–J). Read this first. |
| [phases/](phases/) | One executable brief per phase. Say **"execute Phase N"** and that file alone has everything needed. |
| [archive/](archive/) | Superseded plans, kept for reference. |

## Phase index

| # | Phase | Days | Ships |
|---|---|---|---|
| [00](phases/PHASE-00-foundation.md) | Foundation & Safety Net | 6–8 | Security hotfixes, tests, CI, flags, errors, authz, migrations |
| [01](phases/PHASE-01-identity-institutions.md) | Identity, Institutions & RBAC | 8–10 | `Institution` table, teacher/TA roles, domain verification, sessions |
| [02](phases/PHASE-02-problem-domain.md) | Problem Domain | 14–18 | Versioned DB problems, test data in R2, tags, authoring UI, 700-bank import |
| [03](phases/PHASE-03-judge-engine.md) | Judge v2 — Engine | 12–16 | Language registry, hardened sandbox, CPU/MLE/OLE, checkers |
| [04](phases/PHASE-04-judge-queue.md) | Judge v2 — Queue & Realtime | 10–14 | Redis + BullMQ, worker tier, SSE verdicts, rejudge |
| [05](phases/PHASE-05-contest-engine.md) | Contest Engine v2 | 12–16 | Participation model, pluggable scoring, visibility, snapshots |
| [06](phases/PHASE-06-classroom.md) | Classroom & Courses | 14–18 | Courses/sections/rosters, assignments, gradebook, rollover |
| [07](phases/DONE__PHASE-07-live-contest.md) | Live Contest Experience | 10–14 | Clarifications, live standings, teams, balloons, projector mode |
| [08](phases/PHASE-08-analytics.md) | Analytics & Reporting | 10–12 | Heatmap, tag mastery, at-risk detection, CSV/PDF exports |
| [09](phases/PHASE-09-ratings-leaderboards.md) | Ratings & Leaderboards | 10–14 | Elo-MMR, national board, seasons, badges, certificates |
| [10](phases/PHASE-10-integrity.md) | Academic Integrity | 12–16 | Fingerprint plagiarism, proctoring-lite, **exam variants** |
| [11](phases/PHASE-11-community.md) | Community & Notifications | 10–12 | Editorials, discussion, notification centre, push |
| [12](phases/PHASE-12-platform-api.md) | Platform API & Federation | 10–14 | Public API, webhooks, Polygon import, remote judge |
| [13](phases/PHASE-13-scale-ops.md) | Scale, Performance & Ops | 10–14 | Read models, partitioning, autoscaling, SLOs, DR |
| [14](phases/PHASE-14-i18n-pwa.md) | Localization, A11y & PWA | 8–12 | Bangla, WCAG AA, offline lab mode |
| [15](phases/PHASE-15-intelligence.md) | Intelligence Layer | 12–16 | AI test-gen, editorials, variants, adaptive ladder, hints |

**Backbone**: 0 → 1 → 2 → 3 → 4 → 5 → 6 (~62–82 days). Usable by a department
after Phase 6. Phases 7–15 reprioritise freely on teacher feedback.

## Anatomy of a phase brief

Every brief has the same sections, in the same order, so "execute Phase N" needs
no additional context:

1. **Goal** and **Why now** — the one-paragraph case
2. **Scope** and explicit non-scope
3. **Design decisions** — with rationale and rejected alternatives
4. **Schema** — Prisma diff plus an expand/backfill/contract migration table
5. **File manifest** or module layout — what to create and modify
6. **API contracts** — method, path, auth, behaviour
7. **Frontend surfaces** — routes and components
8. **Testing plan** — per tier
9. **Acceptance criteria** — measurable, not aspirational
10. **Rollback** and **Risks**
11. **Definition of done** — a checklist

## Working agreements

- Every phase ships behind a feature flag named in its brief.
- Every schema change follows expand → backfill → contract
  ([Appendix G](ULTIMATE_PLAN.md#appendix-g--migration-discipline)).
- Every new environment variable is added to
  [Appendix A](ULTIMATE_PLAN.md#appendix-a--environment-variable-registry) and
  `.env.example` in the same commit.
- Architectural decisions are appended to
  [Appendix J](ULTIMATE_PLAN.md#appendix-j--decision-log-adrs) — never edited in
  place; supersede instead.
- When reality diverges from a brief, update the brief. A plan nobody trusts is
  worse than no plan.

## Documents created by later phases

| File | Created in | Contents |
|---|---|---|
| `RUNBOOK.md` | Phase 0, grown thereafter | One entry per alert: meaning, diagnosis, fix, verification |
| `DEPLOYMENT.md` | Phase 4 | Web + worker topology, provisioning, secrets |
| `CAPACITY.md` | Phase 4 | Measured throughput per worker; workers needed per exam size |
| `DR.md` | Phase 13 | Disaster scenarios and decision trees |
| `DR-DRILL.md` | Phase 13 | Restore drill log |
| `ACCESSIBILITY.md` | Phase 14 | WCAG conformance notes and known gaps |
