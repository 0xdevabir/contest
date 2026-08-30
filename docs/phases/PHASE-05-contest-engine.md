# Phase 5 — Contest Engine v2

> **Execute with**: "execute Phase 5"
> **Effort**: 12–16 days · **Flag**: `contestV2`
> **Depends on**: Phase 2, 4 · **Unblocks**: 6, 7, 9, 10

---

## Goal

Rebuild the contest layer around three abstractions that the current code lacks:
a **unified participation model** (live / virtual / practice), **pluggable
scoring engines** (ICPC / IOI / CF / assignment), and a **visibility × join
policy** matrix that supports public, unlisted, password-gated, institution-only
and roster-scoped contests. Plus immutable final standings, contest staff roles,
and contest cloning.

## Why now

Phase 6's assignments are "a scoring policy over a problem set with per-student
deadlines" — they reuse this engine. Phase 9's ratings consume immutable
standings snapshots produced here. Phase 7's live UX assumes participation is a
row it can hang state on. Building any of those first means building a second
scoring implementation and then reconciling them.

The current implementation is not bad — `buildContestDashboard` is already a pure
function over injected data, which is exactly the right shape. It is just
hardcoded to one scoring rule (ICPC-ish) inside a single function of cyclomatic
complexity ~45. This phase decomposes it rather than replacing it.

## Scope

- `ContestParticipation` replacing/absorbing `ContestRegistration`
- Scoring engines as pure pluggable modules; `buildContestDashboard` refactored
  onto them with byte-identical output for existing contests
- `visibility` × `joinPolicy` access model + password/code join
- `ContestStaff` (owner, coauthor, judge, observer)
- `ContestStandingSnapshot` — immutable final standings
- Virtual participation and upsolving on any past contest
- Contest cloning and templates
- Rejudge integration (Phase 4) with automatic standings recompute
- Teacher-facing contest CRUD (currently admin-only)

---

## Design decisions

### D1 — One participation model, three modes

v1's plan added a separate `VirtualParticipation` table alongside
`ContestRegistration`. That guarantees two scoreboard code paths that drift.

```prisma
enum ParticipationMode {
  LIVE       // registered, competing on the contest clock, on the official board
  VIRTUAL    // personal clock started later, ranked on a shadow board
  PRACTICE   // upsolving after the fact, no clock, not ranked
}
```

Every scoring query filters by mode. The official scoreboard is
`mode = LIVE AND official = true`. A virtual participant sees themselves inserted
into a *copy* of the official board at their would-be rank — the Codeforces
behaviour, and impossible to implement cleanly with two tables.

`official` is separate from `mode` because a LIVE participant can be
**unofficial**: a teacher competing alongside their class, a guest from another
institution in a class contest, or someone who registered after the start when
`lateJoin` is allowed. They compete on the real clock but do not appear in the
ranked standings.

### D2 — Visibility and join policy are orthogonal

v1 collapsed these into one enum (`PUBLIC | PRIVATE | CLASS`), which cannot
express "publicly listed but requires a code" or "unlisted, joinable by link".

```prisma
enum ContestVisibility {
  PUBLIC        // listed on /contests, indexed
  UNLISTED      // reachable by link, not listed, noindex
  INSTITUTION   // listed to members of the owning institution only
  PRIVATE       // invisible except to staff and participants
}

enum ContestJoinPolicy {
  OPEN          // anyone who can see it may register
  CODE          // requires a join code
  PASSWORD      // requires a password (code + password = both)
  ROSTER        // auto-scoped to a course section's enrollment (Phase 6)
  INVITE        // explicit invitation only
  STAFF_ONLY    // no participants; a private testing run
}
```

The matrix that matters in practice:

| Use case | Visibility | Join policy |
|---|---|---|
| Public rated contest | `PUBLIC` | `OPEN` |
| Inter-university invitational | `PUBLIC` | `CODE` |
| Lab quiz for one section | `PRIVATE` | `ROSTER` |
| Departmental mock | `INSTITUTION` | `OPEN` |
| Shared with another teacher | `UNLISTED` | `PASSWORD` |
| Setter's test run | `PRIVATE` | `STAFF_ONLY` |

Access checks live in one function, `canAccessContest(actor, contest)`, called by
every read path. The public listing query filters on visibility at the database
level — never in application code, because a listing bug leaks an exam paper.

### D3 — Scoring engines are pure functions

Per [Appendix D](../ULTIMATE_PLAN.md#appendix-d--scoring-engine-contract). The
refactor of `buildContestDashboard` proceeds in three steps, and the middle one
is what makes it safe:

1. Extract the current logic verbatim into `engines/icpc.ts` with no behaviour
   change.
2. **Golden-output test**: capture the dashboard output for 20 real contests
   (fixtures generated from the existing database), assert the refactored code
   produces byte-identical results. This is the gate — it fails loudly if the
   extraction changed anything.
3. Add `ioi.ts`, `cf.ts`, `assignment.ts` behind the engine interface.

`buildContestDashboard` becomes an orchestrator: load data, pick the engine from
`rules.scoring`, call it, format for the UI. Its complexity drops from ~45 to
roughly 10, and each engine is independently property-testable.

### D4 — Final standings are frozen into a snapshot

When a contest ends (and after the freeze is lifted, and after any rejudge
settles), the lifecycle job writes `ContestStandingSnapshot` — the complete
ranked standings as JSON, versioned.

Why this is structural and not a cache:

- Ratings (Phase 9) must consume a fixed input. Rating a moving target produces
  inconsistent deltas.
- A teacher must be able to answer "what did the board say at the end" six months
  later, after the problems have been rejudged twice.
- Certificates (Phase 9) reference a snapshot, not a live query.
- The scoreboard of a finished contest becomes an O(1) read.

A rejudge that changes a finished contest's standings creates snapshot *version
n+1* and records why. The old one is never overwritten.

### D5 — Contest staff, not just a creator

```prisma
enum ContestRole {
  OWNER      // full control, including delete
  COAUTHOR   // edit problems, settings, announcements
  JUDGE      // answer clarifications, rejudge, view all submissions
  OBSERVER   // read-only full visibility (a projected scoreboard, a department head)
}
```

A TA answering clarifications must not be able to change the problem set. A
department head watching the board must not be able to answer clarifications.
`ContestStaff` also solves "the teacher who created it is on leave".

### D6 — Contest rules stay JSON, but validated and versioned

`Contest.rules` is already a JSON blob with a zod schema
(`contestRulesSchema`). Keep it — a normalised table of 20 settings buys nothing
and costs a join. But extend the schema properly and add `rulesVersion` so old
contests keep parsing when defaults change.

```ts
export const contestRulesSchemaV2 = z.object({
  rulesVersion:   z.literal(2),
  scoring:        z.enum(["icpc", "ioi", "cf", "assignment"]).default("icpc"),
  freezeMinutes:  z.number().int().min(0).max(600).default(60),
  unfreezeOnEnd:  z.boolean().default(true),
  penaltyPerWrong: z.number().int().min(0).max(120).default(20),
  maxSubmissionsPerProblem: z.number().int().min(0).max(500).default(0),
  submissionCooldownSec: z.number().int().min(0).max(600).default(0),
  languages:      z.array(z.string()).default([]),        // [] = all enabled
  showSamples:    z.boolean().default(true),
  showTestVerdicts: z.enum(["none", "first-fail", "all"]).default("first-fail"),
  allowPracticeAfter: z.boolean().default(true),
  allowVirtual:   z.boolean().default(true),
  lateJoin:       z.boolean().default(true),
  lateJoinMinutes: z.number().int().min(0).default(0),     // 0 = until the end
  rated:          z.boolean().default(false),
  ratingCategory: z.enum(["global", "institution", "none"]).default("global"),
  teamSize:       z.number().int().min(1).max(3).default(1),
  strictMode:     z.boolean().default(false),              // Phase 10
  publishAfterEnd: z.boolean().default(false),
  notes:          z.string().max(4000).default(""),
});
```

`showTestVerdicts` is worth calling out: ICPC shows nothing, a lab exam should
show the first failing test index (not its content), and a practice contest can
show everything. One setting, three very different pedagogies.

---

## Schema

```prisma
model Contest {
  // ...existing: id, slug, title, description, status, startsAt, endsAt,
  //              durationMinutes, rules, createdById, timestamps

  visibility     ContestVisibility @default(PUBLIC)
  joinPolicy     ContestJoinPolicy @default(OPEN)
  joinCode       String?           @unique
  joinPasswordHash String?

  institutionId  String?
  /// Set for ROSTER contests (Phase 6).
  sectionId      String?
  /// Contests cloned from this one keep a pointer for "run it again" analytics.
  clonedFromId   String?
  isTemplate     Boolean           @default(false)

  /// Denormalised for listing pages; refreshed on participation change.
  participantCount Int             @default(0)

  institution    Institution?      @relation(fields: [institutionId], references: [id], onDelete: SetNull)
  staff          ContestStaff[]
  participations ContestParticipation[]
  snapshots      ContestStandingSnapshot[]
  announcements  ContestAnnouncement[]      // Phase 7
  clarifications ContestClarification[]     // Phase 7
  teams          Team[]                     // Phase 7

  @@index([visibility, status, startsAt])
  @@index([institutionId, status])
  @@index([sectionId])
}

model ContestStaff {
  id        String      @id @default(cuid())
  contestId String
  userId    String
  role      ContestRole @default(JUDGE)
  addedById String
  createdAt DateTime    @default(now())

  contest Contest @relation(fields: [contestId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([contestId, userId])
  @@index([userId])
}

model ContestParticipation {
  id        String            @id @default(cuid())
  contestId String
  userId    String
  teamId    String?
  mode      ParticipationMode @default(LIVE)
  /// Counts toward the ranked standings.
  official  Boolean           @default(true)

  /// Personal clock. For LIVE these mirror the contest; for VIRTUAL they are
  /// offset; for PRACTICE both are null.
  startsAt  DateTime?
  endsAt    DateTime?

  registeredAt DateTime       @default(now())
  /// First page load inside the contest — distinguishes "registered" from "showed up".
  enteredAt    DateTime?

  contest Contest @relation(fields: [contestId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  team    Team?   @relation(fields: [teamId], references: [id], onDelete: SetNull)

  @@unique([contestId, userId, mode])
  @@index([contestId, mode, official])
  @@index([userId, mode])
}

model ContestStandingSnapshot {
  id          String   @id @default(cuid())
  contestId   String
  version     Int
  /// "final" | "freeze" | "rejudge" | "manual"
  reason      String
  /// Full ranked standings; shape = StandingsPayload.
  standings   Json
  problemStats Json    @default("{}")
  participantCount Int @default(0)
  createdById String?
  createdAt   DateTime @default(now())

  contest Contest @relation(fields: [contestId], references: [id], onDelete: Cascade)

  @@unique([contestId, version])
  @@index([contestId, createdAt])
}

model Submission {
  // ...existing
  /// Which participation this submission belongs to. Null = practice outside a contest.
  participationId String?
  participation   ContestParticipation? @relation(fields: [participationId], references: [id], onDelete: SetNull)
  @@index([participationId, createdAt])
}
```

### Migration plan

| Migration | Step | Contents |
|---|---|---|
| `0012_contest_engine` | expand | New enums, `ContestStaff`, `ContestParticipation`, `ContestStandingSnapshot`; new nullable columns on `Contest` and `Submission` |
| `scripts/migrations/0013-backfill-participation.ts` | backfill | Each `ContestRegistration` → `ContestParticipation{mode: LIVE, official: true}`; each contest's creator → `ContestStaff{OWNER}`; link `Submission.participationId` by `(contestId, userId)`; set `visibility: PUBLIC`, `joinPolicy: OPEN` on all existing contests |
| `scripts/migrations/0014-snapshot-finished.ts` | backfill | Generate a v1 snapshot for every already-`ENDED` contest |
| `0015_contest_contract` | contract | Drop `ContestRegistration` after a one-release soak; add FK constraints |

`ContestRegistration` is kept and dual-written during the soak so a rollback does
not lose registrations.

---

## Scoring engines

```
src/lib/scoring/
  index.ts        # engine registry + selection from rules
  types.ts        # ScoringEngine, ScoredSubmission, ProblemCell, StandingsRow
  icpc.ts         # extracted verbatim from buildContestDashboard
  ioi.ts
  cf.ts
  assignment.ts   # Phase 6 uses it; defined here so both share one implementation
  freeze.ts       # freeze/unfreeze filtering, shared by all engines
  rank.ts         # ranking + tie handling, shared
```

### `icpc.ts`

Total = solved count. Penalty = `Σ over solved problems (minutesToAc + penaltyPerWrong × wrongBefore)`.
Rejected verdicts that count as wrong: `WA`, `RE`, `TLE`, `MLE`, `OLE`, `PA`.
Never counted: `CE`, `IE`, `SKIP`. *(The current code penalises `WA/RE/TLE/MLE`;
extend to `OLE`/`PA` and explicitly exclude `IE` — an infrastructure failure must
never cost a student penalty minutes.)*

Tie-break: `(−solved, penalty, lastAcMinute)`.

### `ioi.ts`

Total = `Σ over problems max(score over that problem's submissions)`. No penalty.
Group dependencies resolved by the Phase 3 judge, so the engine only sums.
Tie-break: `(−total, totalTimeOfBestSubmissions)`.

Nuance: "best submission" is per-problem-maximum *score*, not the last
submission. A student who scores 70 then 40 keeps 70. This differs from ICPC
intuition and must be stated in the UI.

### `cf.ts`

`problemScore(t) = max(0.3 × P, P × (1 − 0.4 × t / duration)) − 50 × wrongBefore`,
clamped at 0, where `t` is minutes from contest start. Total = `Σ`.
Tie-break: `(−total, lastAcMinute)`.

### `assignment.ts` (used from Phase 6)

`Σ over problems (bestScore × lateMultiplier(submittedAt, dueAt, policy)) + manualMarks`.
Late policy: `none` (0 after due), `linear` (−x% per day, floored), `grace`
(full credit within N hours, then linear). Manual marks are teacher-entered
per-problem adjustments that survive rejudges.

### Shared: `freeze.ts`

```ts
export function applyFreeze<T extends { createdAt: Date }>(
  submissions: T[],
  freezeAt: Date | null,
  viewer: { isStaff: boolean; ownId?: string; ownerOf?: (s: T) => boolean },
): { visible: T[]; hiddenCount: number };
```

Rules: staff see through the freeze; a participant always sees their **own**
submissions unfrozen (otherwise they cannot tell whether their last submission
was accepted, which is user-hostile and not what the freeze protects); everyone
else sees the pre-freeze state with a pending-count badge per cell.

### Property tests (all engines)

| Property | Statement |
|---|---|
| Monotonicity | Adding a later `AC` never decreases a participant's total |
| Freeze-invariance | Unfreezing only adds information — pre-freeze ranks never invert among pre-freeze-solved participants |
| Determinism | Same inputs, shuffled submission order → identical output |
| No-IE-penalty | Injecting `IE` submissions changes nothing |
| Rank totality | Every participant gets exactly one rank; ties share a rank and the next rank skips |
| Snapshot equality | Engine output for a finished contest equals its stored snapshot |

---

## Access control

`src/lib/contest-access.ts` rewritten:

```ts
export type ContestCapability =
  | "view" | "viewProblems" | "register" | "submit"
  | "viewStandings" | "viewAllSubmissions" | "edit" | "manageStaff" | "rejudge";

export async function contestCapabilities(
  actor: Actor,
  contest: ContestForAccess,
  participation?: ContestParticipation | null,
): Promise<Set<ContestCapability>>;
```

One function returns everything the caller may do; pages and routes read from the
set rather than each re-deriving the rules. The existing
`contestSubmissionError()` becomes a thin formatter over the same source of
truth, so the message a student sees and the check the server makes can never
diverge.

Join flow for `CODE`/`PASSWORD`: `POST /api/contests/[id]/join` with the secret,
rate-limited per user (`join:contest`, 10/hour) to prevent brute-forcing a
4-character code. Codes are 8 characters from an unambiguous alphabet
(no `0/O`, `1/l/I`) because they get read aloud in a classroom.

---

## API contracts

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/contests` | public | Visibility-filtered at the DB level; `?phase=live\|upcoming\|past` |
| `GET` | `/api/contests/[slug]` | capability `view` | — |
| `POST` | `/api/contests/[id]/register` | capability `register` | Creates `LIVE` participation |
| `POST` | `/api/contests/[id]/join` | session | `{ code?, password? }` |
| `POST` | `/api/contests/[id]/virtual` | session | Starts a `VIRTUAL` participation with a personal clock |
| `DELETE` | `/api/contests/[id]/virtual` | owner | Abandon a virtual run |
| `GET` | `/api/contests/[id]/standings` | capability `viewStandings` | Live (Redis) or snapshot (finished) |
| `GET` | `/api/contests/[id]/standings/[version]` | staff | Historical snapshot |
| `POST` | `/api/teacher/contests` | teacher | Create — **new**: teachers, not just admins |
| `PATCH` | `/api/teacher/contests/[id]` | capability `edit` | — |
| `POST` | `/api/teacher/contests/[id]/problems` | capability `edit` | Add/reorder/repoint problems; pins `problemVersionId` |
| `POST` | `/api/teacher/contests/[id]/staff` | capability `manageStaff` | — |
| `POST` | `/api/teacher/contests/[id]/clone` | teacher | Clone into a new draft |
| `POST` | `/api/teacher/contests/[id]/snapshot` | capability `edit` | Force a snapshot (after a rejudge) |

---

## Contest lifecycle

`src/lib/contest-lifecycle.ts` (exists) becomes the scheduler's contest tick,
running every minute:

| Transition | Trigger | Side effects |
|---|---|---|
| `SCHEDULED → LIVE` | `now ≥ startsAt` | Notify registrants (Phase 11); warm the standings cache; pre-pull sandbox images |
| freeze begins | `now ≥ endsAt − freezeMinutes` | Snapshot `reason: "freeze"`; flip the board to frozen |
| `LIVE → ENDED` | `now ≥ endsAt` | Drain the judge queue for this contest, wait ≤ 120 s; unfreeze; snapshot `reason: "final"`; enqueue rating (Phase 9) and plagiarism (Phase 10) jobs; notify participants |
| virtual expiry | per-participation `endsAt` | Freeze that participant's personal board |

**Drain before snapshot** is important and easy to miss: a submission sent at
59:59 is still queued at 60:00. Ending the contest without draining produces a
final board that changes 20 seconds later. Wait for `state IN ('QUEUED','JUDGING')`
for this contest to reach zero, with a 120 s cap and a logged warning if it
expires.

---

## Frontend surfaces

| Route | Work |
|---|---|
| `app/contests/page.tsx` | Visibility-aware listing; badges for code-gated / institution / rated; "Join by code" entry |
| `app/contests/join/page.tsx` *(new)* | Enter a code or contest id + password |
| `app/contests/[slug]/page.tsx` | Participation-aware: register / enter / start virtual / practice; staff toolbar |
| `components/contest/ContestDashboard.tsx` | Engine-agnostic rendering: score column for IOI/CF, penalty for ICPC, partial cells for `PA`, frozen-pending badges |
| `components/contest/StandingsTable.tsx` *(new)* | Extracted from the dashboard; used for live, virtual and snapshot views |
| `components/contest/VirtualStart.tsx` *(new)* | Explains the personal clock; confirms |
| `components/admin/ContestEditor.tsx` → `components/contest/ContestEditor.tsx` | Moved out of admin-only; visibility × join policy, scoring engine picker with an explanation of each, language multi-select, staff management |
| `app/teacher/contests/**` *(new)* | Teacher-scoped contest CRUD mirroring the admin one |
| `components/contest/CloneContest.tsx` *(new)* | Clone with options: problems, settings, staff, roster |

The scoring-engine picker deserves care. A teacher choosing between "ICPC" and
"IOI" needs one sentence each, not a link to Wikipedia: *"ICPC — rank by number
solved, ties broken by time and wrong-attempt penalties. Best for contests."*
*"IOI — rank by total points across subtasks, no penalties. Best for exams with
partial credit."*

---

## Testing plan

| Tier | Test |
|---|---|
| Golden | 20 real-contest fixtures produce byte-identical dashboards pre/post refactor |
| Property | All six properties above, per engine, with `fast-check` |
| Unit | `contestCapabilities` — full matrix of 4 visibilities × 6 join policies × 5 actor kinds |
| Unit | Freeze: own submissions visible, others' hidden, staff sees all, boundary minute |
| Unit | Virtual clock: rank insertion into the official board; expiry |
| Integration | `PRIVATE`+`ROSTER` contest never appears in `/api/contests` for a non-member, including with a direct slug |
| Integration | Wrong join password → 403, rate-limited after 10 attempts |
| Integration | Contest end drains the queue before snapshotting |
| Integration | Rejudge on a finished contest creates snapshot v2 and leaves v1 intact |
| Migration | Backfill produces one participation per registration; submissions link correctly; re-runnable |

---

## Acceptance criteria

1. Existing contests render identically after the refactor — proven by the golden
   fixtures, not by inspection.
2. A teacher (not admin) creates a contest, adds staff, sets it `PRIVATE` +
   `CODE`, and runs it.
3. A private contest is invisible in every listing and unreachable by slug to
   non-participants.
4. A subtask problem in an IOI contest produces partial scores on the board.
5. A student starts a virtual run of a past contest, gets a personal clock, and
   sees their rank inserted among the original participants.
6. Freeze hides others' last-hour changes while showing the student their own.
7. Contest end waits for the queue to drain, then writes an immutable snapshot.
8. Cloning a contest produces a draft with the same problems and settings and no
   participants.
9. `buildContestDashboard` complexity is under 15; each engine is under 100 lines.

## Rollback

`contestV2` off restores the v1 dashboard path, which still reads
`ContestRegistration` (dual-written throughout the soak). Snapshots and
participations are additive and harmless if unused.

## Risks

| Risk | Mitigation |
|---|---|
| The scoring refactor silently changes a past result | Golden fixtures from real contests as a blocking gate |
| Visibility bug leaks an exam | DB-level filtering, a dedicated integration test per visibility value, and an admin "who can see this?" preview on the contest editor |
| Participation backfill mis-links submissions | Reconciliation query; dual-write; soak before contract |
| Teachers create public contests that pollute the archive | Teacher-created contests default to `PRIVATE`; making one `PUBLIC` requires admin approval unless the teacher's institution is verified |
| Virtual participation confuses the rated board | Virtual is never rated and never enters the official snapshot; enforced in the engine, not the UI |
| Queue drain at contest end blocks the tick | 120 s cap, warning logged, snapshot proceeds regardless with a `partial: true` marker |

## Definition of done

- [ ] `ContestParticipation` live; registrations backfilled; submissions linked
- [ ] Four scoring engines implemented and property-tested
- [ ] Golden fixtures prove no behaviour change on existing contests
- [ ] `visibility` × `joinPolicy` implemented with DB-level filtering
- [ ] `ContestStaff` with four roles enforced through `contestCapabilities`
- [ ] Immutable standings snapshots, versioned, written on freeze and end
- [ ] Virtual participation and upsolving live
- [ ] Contest cloning + templates
- [ ] Teacher contest CRUD outside `/admin`
- [ ] Rules schema v2 with migration of existing `rules` blobs
