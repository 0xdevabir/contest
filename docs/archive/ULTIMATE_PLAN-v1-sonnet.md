# DIU ContestHub — Ultimate Platform Plan

> Living document. Update as decisions change. Each phase below is meant to be
> handed back to Claude verbatim ("execute Phase N") and implemented without
> re-deriving context — so keep this file current as phases land.

## 0. Where we are today (baseline, as of 2026-08-30)

- **Stack**: Next.js 15 (App Router) + React 19 + TypeScript, Tailwind 4, Prisma 6 + Neon Postgres.
- **Auth**: custom JWT (`jose`) + `bcryptjs`, no OAuth, roles = `USER | ADMIN` only.
- **Judge**: C-only. Local `clang`/`gcc` compile in `src/lib/judge.ts`, optional
  Docker sandbox runner service (`runner/`), optional remote Judge0-style fallback
  (`src/lib/remote-judge.ts`). Synchronous request/response — no queue.
- **Problems**: static bank (`data/problems.json`, 700-raw source), not DB-authored.
  No teacher-facing problem creation.
- **Contests**: `Contest`, `ContestProblem`, `ContestRegistration`, `Submission`,
  `SolvedProblem` models. Scheduling, rules JSON blob, admin-only creation via
  `/admin/contests`. No private/password-protected contests yet, no classes/cohorts.
- **University**: hardcoded 4-value enum (DIU, NSU, AIUB, BRAC) — not a real table.
- **Admin**: solid command center already (analytics, users, submissions, system
  health, audit log via `AdminAuditLog`).
- **What's missing vs. the vision**: teacher role & class management, private/class
  contests with join codes, multi-language judging, scalable judge queue,
  DB-authored problems with real test cases and checkers, plagiarism detection,
  virtual participation, rating system, notifications, discussion/clarifications,
  analytics for teachers on individual/class performance.

## 1. Vision

DIU ContestHub becomes a **university-grade competitive programming + classroom
practice platform** combining:

- **Toph/Codeforces-style** public contests, ratings, editorials, virtual
  participation, and a large open problem archive solvable without login.
- **vJudge-style** contest hosting flexibility: any teacher can spin up a
  public or password-protected private contest in minutes.
- **Classroom LMS-lite**: teachers manage classes/sections, assign problem
  sets, track individual and cohort performance over a semester, export
  reports — something none of Toph/vJudge/Codeforces do well.

The differentiator is **teacher-in-the-loop practice management** layered on
top of a genuinely good judge and contest experience — not just another
contest clone.

## 2. Roles & personas

| Role | Description |
|---|---|
| **Guest** | Solves public problems, no save. Sees public leaderboards, public contests. |
| **Student** | Registered user. Persists solves/submissions, joins public/private/class contests, has a rating, a public profile, class enrollments. |
| **Teacher** | Creates/manages one or more Classes, authors problems, creates contests (public, private w/ join code+password, or class-scoped), views deep per-student and per-class analytics. |
| **Admin** | Existing capabilities (site-wide moderation, all-contest oversight, system health) plus teacher-account approval and platform config. |

`Role` enum grows: `USER → STUDENT` (rename or alias), add `TEACHER`, keep
`ADMIN`. Migration must preserve existing `USER` rows as `STUDENT`.

## 3. Feature enhancements beyond the original ask (my additions)

1. **Multi-language judge** (C, C++, Python 3, Java, JavaScript) — a C-only
   judge caps adoption; most CS curricula teach C++/Python/Java too.
2. **Scalable async judge queue** (Redis + BullMQ) instead of synchronous
   compile-and-wait — required once contests have >50 concurrent submitters.
3. **DB-authored problems** with statement (Markdown/LaTeX), multiple test
   cases, special judges/checkers, subtasks, partial scoring — teachers need
   this to author real assignments, not just pick from a static bank.
4. **Class/cohort model** — the actual differentiating feature: `Class`,
   `ClassEnrollment`, roster CSV import, per-class assignments and analytics.
5. **Private & class-scoped contests** — join code + password, or auto-scoped
   to a class roster with no code needed.
6. **Virtual participation / upsolving** — practice a past contest on its
   original clock, like Codeforces virtual contests.
7. **Rating system** (ELO/Codeforces-style) — global + per-university,
   separate from raw solve counts, gives long-term engagement.
8. **Editorials & discussion** — per-problem editorial (teacher/admin authored)
   + threaded Q&A, and in-contest clarification requests answered by contest
   authors live.
9. **Plagiarism/similarity detection** — MOSS-style token-based AST/string
   similarity across a contest's submissions, flagged for teacher review.
10. **Anti-cheat for private/class contests** — optional fullscreen
    enforcement, tab-switch/blur event logging, single active session per user
    during a live contest.
11. **Notifications** — in-app notification center + email for contest start
    reminders, results, clarifications answered, class announcements.
12. **Gamification** — streaks, badges (first-AC, 100-solves, contest-podium),
    surfaced on public profile.
13. **Teacher analytics** — class heatmap (who solved what), weak-topic
    detection via tag-level accuracy, exportable CSV/PDF grade reports.
14. **Problem tags & recommendations** — tag taxonomy (DP, graphs, greedy...),
    difficulty-aware "next problem" suggestions per student.
15. **Public API + Polygon-style problem import** — lets power-user teachers
    bulk-import problem packages instead of hand-authoring everything.
16. **i18n (Bangla + English)** and **PWA polish** — manifest.ts already
    exists; push it to full offline-capable PWA with Bangla UI toggle.

## 4. Target architecture additions

- **Redis** (Upstash or self-hosted) for: judge job queue (BullMQ), rate
  limiting, session/notification pub-sub, leaderboard caching.
- **Judge workers**: horizontally scalable worker processes consuming the
  queue, each invoking the existing Docker sandbox (`runner/sandbox.Dockerfile`)
  per language image. Decouples web request latency from judging latency.
- **Object storage** (S3-compatible, e.g. Cloudflare R2) for large test case
  files and problem statement assets — Postgres stays lean.
- **New Prisma models** (see per-phase detail below): `Class`,
  `ClassEnrollment`, `ProblemDB` (or extend existing static bank into DB),
  `TestCase`, `Checker`, `Tag`, `ProblemTag`, `ContestAnnouncement`,
  `ContestClarification`, `Rating`, `RatingHistory`, `Notification`,
  `PlagiarismReport`, `Badge`, `UserBadge`, `VirtualParticipation`.
- **Auth stays custom JWT** (no need to introduce NextAuth) but gains: refresh
  token rotation, optional Google OAuth restricted to university email domains,
  per-session revocation for anti-cheat "single active session" enforcement.

---

## 5. Phased delivery plan

Each phase is independently executable, ships a working increment, and does
not block on later phases. Order reflects dependency and value; re-sequence
if priorities change. When told "execute Phase N", implement exactly the
scope below — schema diff, files, routes, UI, and acceptance criteria.

### Phase 1 — Roles & RBAC foundation

**Goal**: introduce `TEACHER` role and real role-based access control so every
later phase has somewhere to hang permissions.

**Schema**:
```prisma
enum Role {
  STUDENT   // renamed from USER; write a migration that maps USER -> STUDENT
  TEACHER
  ADMIN
}

model User {
  // existing fields...
  teacherApproved Boolean @default(false) // admin must approve new teacher accounts
}
```

**Backend**:
- `src/lib/auth.ts`: extend session payload with role; add `requireRole()` /
  `requireTeacherOrAdmin()` guards mirroring existing `requireAdmin`-style checks.
- New route group middleware pattern: `src/lib/rbac.ts` exporting
  `assertRole(session, roles: Role[])` thrown as typed `ForbiddenError`.
- Registration flow: add a "Register as teacher" path that sets
  `role: TEACHER, teacherApproved: false`; teacher features gated on
  `teacherApproved`.
- Admin: `/admin/teachers` page + `PATCH /api/admin/teachers/[id]/approve`.

**Frontend**:
- `NavAuth.tsx`: role-aware nav (Teacher gets "My Classes" / "My Problems" links).
- Registration form: role selector (Student / Teacher), teacher accounts show
  a "pending approval" banner until approved.

**Acceptance criteria**:
- Existing USER/ADMIN accounts unaffected after migration.
- A new teacher signup cannot access teacher routes until admin-approved.
- `npm run check:scoring` and existing auth tests still pass.

---

### Phase 2 — Class & cohort management

**Goal**: teachers can create classes, enroll students, and see a roster —
the core classroom-management differentiator.

**Schema**:
```prisma
model Class {
  id          String   @id @default(cuid())
  name        String
  section     String?
  university  University
  teacherId   String
  inviteCode  String   @unique
  archived    Boolean  @default(false)
  createdAt   DateTime @default(now())

  teacher     User               @relation("ClassTeacher", fields: [teacherId], references: [id])
  enrollments ClassEnrollment[]
  contests    Contest[]          @relation("ClassContests")

  @@index([teacherId])
}

model ClassEnrollment {
  id        String   @id @default(cuid())
  classId   String
  userId    String
  role      String   @default("STUDENT") // room for TA later
  joinedAt  DateTime @default(now())

  class Class @relation(fields: [classId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([classId, userId])
}
```

**Backend**:
- `POST /api/teacher/classes`, `GET /api/teacher/classes`,
  `POST /api/teacher/classes/[id]/roster` (CSV upload → bulk enroll by email,
  create pending invites for unregistered emails).
- `POST /api/classes/join` — student joins via `inviteCode`.
- `src/lib/classes.ts`: roster CSV parsing/validation (reuse `zod`), enrollment
  helpers, class-scoped submission/solve aggregation queries.

**Frontend**:
- `/teacher/classes` (list + create), `/teacher/classes/[id]` (roster table,
  per-student solve count, invite code/link with copy button).
- `/classes/join` page + "Join a class" entry point on student dashboard.
- CSV roster template download + upload with per-row validation errors shown.

**Acceptance criteria**: a teacher creates a class, shares invite code, a
student joins, roster reflects it, CSV bulk-import enrolls 30 students in one
upload with clear per-row errors for bad emails.

---

### Phase 3 — Private & class-scoped contests

**Goal**: contests gain a `visibility` axis so teachers can run assignments
that don't pollute the public `/contests` page.

**Schema**:
```prisma
enum ContestVisibility {
  PUBLIC
  PRIVATE   // joinable via contest ID + password
  CLASS     // auto-restricted to one Class roster, no code needed
}

model Contest {
  // existing fields...
  visibility   ContestVisibility @default(PUBLIC)
  joinPasswordHash String?
  classId      String?
  class        Class? @relation("ClassContests", fields: [classId], references: [id])
}
```

**Backend**:
- Extend `src/lib/contests.ts` + `contest-access.ts`: visibility-aware access
  checks (`CLASS` → must be in `ClassEnrollment`; `PRIVATE` → must supply
  password once, then registration persists as today).
- `POST /api/contests/[id]/join` accepts `{ password }` for PRIVATE contests.
- Public `/contests` listing query filters to `visibility: PUBLIC` only.
- New `/contests/private` "Join by ID" entry page for PRIVATE contests
  (mirrors vJudge's join flow).

**Frontend**:
- `ContestEditor.tsx`: visibility selector (Public / Private+password /
  Class-scoped with class picker for the teacher's own classes).
- Contest card badge for Private/Class contests on teacher & admin dashboards.

**Acceptance criteria**: a teacher creates a CLASS contest — only enrolled
students see/can register; a PRIVATE contest requires correct password once;
public listing never leaks private/class contests.

---

### Phase 4 — DB-authored problems for teachers

**Goal**: replace "pick from static bank only" with real problem authoring:
statement, test cases, checker, subtasks — so teachers can write original
assignments and exam questions.

**Schema**:
```prisma
model Problem {
  id            String   @id @default(cuid())
  slug          String   @unique
  title         String
  statementMd   String
  constraints   String   @default("")
  timeLimitMs   Int      @default(2000)
  memoryLimitMb Int      @default(256)
  difficulty    Int      @default(0)
  checkerType   String   @default("diff") // diff | special
  checkerCode   String?  // special judge source, if checkerType = special
  authorId      String
  isPublic      Boolean  @default(false)  // visible in open archive
  createdAt     DateTime @default(now())

  author    User        @relation("ProblemAuthor", fields: [authorId], references: [id])
  testCases TestCase[]
  tags      ProblemTag[]
}

model TestCase {
  id         String  @id @default(cuid())
  problemId  String
  input      String
  expected   String
  isSample   Boolean @default(false)
  subtask    Int     @default(0)
  points     Int     @default(0)
  order      Int     @default(0)

  problem Problem @relation(fields: [problemId], references: [id], onDelete: Cascade)
  @@index([problemId, order])
}

model Tag {
  id   String @id @default(cuid())
  name String @unique
}

model ProblemTag {
  problemId String
  tagId     String
  problem   Problem @relation(fields: [problemId], references: [id], onDelete: Cascade)
  tag       Tag     @relation(fields: [tagId], references: [id], onDelete: Cascade)
  @@id([problemId, tagId])
}
```

Note: existing static-bank problems (`data/problems.json`) get a one-time
import script into `Problem`/`TestCase` so `ContestProblem.problemId`
continues to resolve uniformly from the DB going forward.

**Backend**:
- `src/lib/problems.ts` gains DB-backed CRUD replacing/augmenting the static
  bank reader; keep a compatibility shim so existing contest/problem pages
  don't all need rewriting at once.
- `POST /api/teacher/problems`, `PUT /api/teacher/problems/[id]`,
  `POST /api/teacher/problems/[id]/testcases` (bulk upload, zip of `.in`/`.out`
  pairs parsed server-side).
- Statement editor uses Markdown (reuse existing Monaco or a lighter MD
  textarea + preview pane — don't add a new heavy WYSIWYG dependency).

**Frontend**:
- `/teacher/problems` (list, own problems only unless admin), `/teacher/problems/new`
  and `/teacher/problems/[id]/edit` with tabs: Statement / Test Cases / Settings.
- Test case table: add/edit/delete rows, mark sample vs hidden, drag-to-reorder.

**Acceptance criteria**: a teacher authors a problem end-to-end (statement +
5 test cases, 2 marked sample) and attaches it to a class contest; students
see only sample cases pre-contest, judge validates against all cases.

---

### Phase 5 — Multi-language judge + scalable queue

**Goal**: support C++, Python, Java, JS alongside C, and move judging off the
request/response path so contests scale past ~50 concurrent submitters.

**Infra**:
- Redis instance (Upstash free tier acceptable to start) + `bullmq` dependency.
- `runner/` gains per-language Dockerfiles (`sandbox.cpp.Dockerfile`,
  `sandbox.py.Dockerfile`, `sandbox.java.Dockerfile`, `sandbox.js.Dockerfile`)
  or a single multi-toolchain image if image size is acceptable — decide
  based on cold-start time measured in this phase.

**Schema**:
```prisma
model Submission {
  // existing fields...
  status Verdict @default(SKIP) // reuse Verdict enum; add PENDING/JUDGING states
}
```
Add to `Verdict` enum: `PENDING`, `JUDGING` (existing `SKIP` stays as a
distinct "not run" state, don't overload it).

**Backend**:
- `src/lib/judge.ts` refactor: `compileAndJudge` becomes
  `enqueueJudgeJob(submissionId)` — pushes to BullMQ, returns immediately;
  the actual compile/run logic moves into a worker entrypoint
  (`runner/worker.js` or a new `scripts/judge-worker.ts`) that consumes jobs,
  calls the existing per-language sandbox, and writes verdict back via Prisma.
- `POST /api/judge` becomes "submit" (enqueue + return submissionId), add
  `GET /api/submissions/[id]/status` for polling, or a lightweight SSE/
  WebSocket channel for live verdict push (prefer polling first — simpler,
  upgrade to SSE if UX needs it).
- Language selection threaded through `CodeEditor.tsx` → submission payload
  → worker picks the right Docker image/toolchain.

**Frontend**:
- `CodeEditor.tsx`: language dropdown (C/C++/Python/Java/JS), Monaco syntax
  highlighting per language (already supported by monaco-editor core).
- Submission result UI: pending/judging spinner state, live-updating verdict.

**Acceptance criteria**: a Python and a C++ solution both judge correctly
against the same problem's test cases; 50 simultaneous submissions during a
load test complete without the web server blocking on judge execution.

---

### Phase 6 — Contest experience: clarifications, virtual, freeze

**Goal**: close the gap with Codeforces/Toph's live-contest UX.

**Schema**:
```prisma
model ContestAnnouncement {
  id        String   @id @default(cuid())
  contestId String
  body      String
  createdAt DateTime @default(now())
  contest   Contest  @relation(fields: [contestId], references: [id], onDelete: Cascade)
}

model ContestClarification {
  id         String   @id @default(cuid())
  contestId  String
  userId     String
  problemId  String?
  question   String
  answer     String?
  answeredAt DateTime?
  createdAt  DateTime @default(now())

  contest Contest @relation(fields: [contestId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VirtualParticipation {
  id         String   @id @default(cuid())
  contestId  String
  userId     String
  startedAt  DateTime @default(now())
  endsAt     DateTime

  contest Contest @relation(fields: [contestId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([contestId, userId])
}
```

**Backend**:
- Announcement CRUD (contest owner/admin only) + clarification ask/answer
  endpoints; students poll or SSE-subscribe during a live contest.
- Virtual participation: `POST /api/contests/[id]/virtual-start` creates a
  personal clock (`endsAt = now + durationMinutes`); scoring/timer logic in
  `contest-dashboard.ts` and `ContestClock.tsx` becomes participation-aware
  (real registration vs. virtual) rather than purely contest-clock-based.
- Scoreboard freeze: `rules.freezeMinutes` already exists in the JSON blob —
  wire it into actual leaderboard query logic in `leaderboard.ts` (hide
  updates in the last N minutes, reveal on contest end for registered
  non-virtual participants).

**Frontend**:
- In-contest sidebar: Announcements feed + "Ask a question" form +
  clarification thread (visible to asker + contest staff; broadcast answers
  visible to all).
- "Practice as virtual contest" button on ended public contests.
- Frozen-scoreboard indicator (lock icon, "final standings after contest ends").

**Acceptance criteria**: announcement posted by teacher appears live to
registered students; a virtual participant's personal clock and scoring is
isolated from the live leaderboard; freeze hides last-N-minute changes.

---

### Phase 7 — Teacher analytics & reporting

**Goal**: the actual "track student/class performance" ask from the original
brief — teacher-facing depth beyond what admin analytics already covers.

**Backend**:
- `src/lib/teacher-analytics.ts`: per-class heatmap query (student × problem
  grid of verdicts), per-student tag-accuracy breakdown (join `Submission` →
  `Problem` → `ProblemTag` → `Tag`, aggregate AC-rate by tag), time-series of
  a student's solve activity.
- CSV/PDF export endpoint: `GET /api/teacher/classes/[id]/report.csv`
  (grade-book style: rows = students, columns = assigned problems/contests,
  cell = best verdict + score).

**Frontend**:
- `/teacher/classes/[id]/analytics`: heatmap grid, weak-topic bar chart,
  class-average vs individual overlay.
- `/teacher/students/[id]` deep-dive (reuse/extend existing `/u/[id]` public
  profile pattern but with teacher-only extra panels: submission history
  across the teacher's own contests/classes, per-tag accuracy).

**Acceptance criteria**: teacher opens a class analytics page for a 40-student
class and identifies, within one screen, who hasn't started an assignment and
which tag the cohort is weakest on; CSV export opens cleanly in Excel/Sheets.

---

### Phase 8 — Rating system & gamification

**Goal**: long-term engagement mechanics beyond raw solve counts.

**Schema**:
```prisma
model Rating {
  userId  String @id
  current Int    @default(1500)
  peak    Int    @default(1500)
  user    User   @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model RatingHistory {
  id        String   @id @default(cuid())
  userId    String
  contestId String
  delta     Int
  ratingAfter Int
  createdAt DateTime @default(now())
}

model Badge {
  id          String @id @default(cuid())
  code        String @unique // "first-ac", "streak-30", "podium"
  name        String
  description String
}

model UserBadge {
  userId    String
  badgeId   String
  earnedAt  DateTime @default(now())
  @@id([userId, badgeId])
}
```

**Backend**:
- `src/lib/rating.ts`: Codeforces-style ELO update run as a post-contest job
  (triggered from `contest-lifecycle.ts` when a **rated, PUBLIC** contest ends).
  Only PUBLIC contests are rated by default — CLASS/PRIVATE contests opt in
  via a `rules.rated` flag.
- Badge-award checks run on submission/contest-end events (streak tracking
  needs a lightweight daily-solve cursor per user).

**Frontend**:
- Rating shown on public profile + a colored rating tier (like CF colors),
  rating graph (simple line chart, reuse existing chart approach from admin
  analytics if one exists, else a small dependency-free SVG sparkline).
- Badge shelf on profile.

**Acceptance criteria**: ending a rated public contest updates every
participant's rating with a visible delta and history entry; badges award
automatically and appear on `/u/[id]`.

---

### Phase 9 — Plagiarism detection & anti-cheat

**Goal**: give teachers confidence running graded private/class contests.

**Schema**:
```prisma
model PlagiarismReport {
  id            String   @id @default(cuid())
  contestId     String
  submissionAId String
  submissionBId String
  similarity    Float
  createdAt     DateTime @default(now())
}
```

**Backend**:
- `scripts/plagiarism-check.ts` (or a queued job on contest end): tokenizes
  submitted code (strip identifiers/whitespace, keep structure — a
  Winnowing/k-gram fingerprint approach is enough, no need for full MOSS),
  pairwise-compares same-problem submissions within a contest, flags pairs
  above a similarity threshold.
- Anti-cheat event logging: `POST /api/contests/[id]/anti-cheat-event` fired
  from the client on `visibilitychange`/blur during a CLASS or PRIVATE
  contest with `rules.strictMode: true`; stored on `Submission`-adjacent
  audit table or reuse `AdminAuditLog`-style pattern scoped to teachers.

**Frontend**:
- `ProblemWorkspace.tsx`: optional fullscreen-enforcement + tab-switch
  warning banner when `strictMode` is on for the active contest.
- `/teacher/contests/[id]/integrity`: flagged pairs list with side-by-side
  diff view, teacher can dismiss or escalate to admin.

**Acceptance criteria**: two near-identical submissions in the same contest
surface as a flagged pair with a similarity score; tab-switch events during a
strict-mode contest are visible to the teacher after the contest ends.

---

### Phase 10 — Notifications & discussion

**Goal**: keep students/teachers informed without manual polling.

**Schema**:
```prisma
model Notification {
  id        String   @id @default(cuid())
  userId    String
  type      String   // contest_start, contest_result, clarification_answered, class_announcement
  payload   Json     @default("{}")
  readAt    DateTime?
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, readAt])
}

model Comment {
  id         String   @id @default(cuid())
  problemId  String
  userId     String
  parentId   String?
  body       String
  createdAt  DateTime @default(now())
}
```

**Backend**:
- Notification creation hooked into existing event points (contest lifecycle,
  clarification answer, class announcement) rather than a new event bus —
  keep it simple, direct Prisma writes at the call site.
- Existing `mail.ts` reused for the email half of each notification type
  (respect a per-user notification-preferences toggle to avoid spam).
- Comment CRUD scoped per problem, nested one level (no deep threading needed).

**Frontend**:
- Bell icon in nav (`NavAuth.tsx` area) with unread count + dropdown list,
  mark-as-read on open.
- Problem page: discussion tab below statement (post-contest only for
  contest problems, to avoid leaking hints mid-contest).

**Acceptance criteria**: contest-start reminder email + in-app notification
fires 15 minutes before a registered contest; discussion comment posts and
renders threaded one level deep.

---

### Phase 11 — Public API & problem-package import

**Goal**: let power users automate and bulk-import instead of hand-authoring
everything through the UI.

**Backend**:
- API key model (`ApiKey` table, hashed key, scoped to a teacher/admin user),
  `Authorization: Bearer` middleware reusing the RBAC guards from Phase 1.
- REST endpoints: `GET /api/v1/problems`, `POST /api/v1/problems` (with
  test cases inline), `GET /api/v1/contests/[id]/standings`.
- Polygon-style `.zip` package importer: parses `problem.xml` +
  `tests/*.a`/`*.txt` convention into `Problem`/`TestCase` rows — reuses the
  Phase 4 test-case bulk-upload path under the hood.

**Frontend**:
- `/teacher/settings/api-keys` (create/revoke keys).
- Problem editor gains an "Import package" button next to manual authoring.

**Acceptance criteria**: a `.zip` exported from Polygon imports as a complete
problem with statement + test cases in one upload; an API key can fetch
contest standings via curl.

---

### Phase 12 — Performance, i18n, PWA polish

**Goal**: production hardening once feature surface is complete.

**Work items**:
- Leaderboard caching in Redis (invalidate on new AC submission) — avoids
  recomputing standings on every page view during a live contest.
- Full-text/global search (problems + contests + users) — Postgres
  `tsvector` is sufficient at this scale, no need for a separate search service.
- Bangla localization: extract UI strings, add a locale toggle persisted in
  `User.theme`-style preference field, ship English + Bangla only (avoid
  over-engineering a full i18n framework for two languages — a small
  key-based dictionary is enough).
- PWA: service worker for offline problem-statement caching (already has a
  `manifest.ts` — extend it), push notifications via Web Push for the
  Phase 10 notification types.
- Load test the judge queue (Phase 5) at realistic contest concurrency
  (200+ simultaneous submitters) and tune worker pool size / Docker resource
  limits accordingly.

**Acceptance criteria**: Lighthouse PWA score green, leaderboard p95 response
time under load stays flat vs. baseline, Bangla toggle covers all
student-facing pages.

---

## 6. Suggested execution order & rationale

1→2→3→4→5 are the backbone (roles, classes, private contests, real problems,
scalable judging) and should land roughly in order since each depends on the
previous. 6–11 are largely independent of each other once 1–5 exist and can
be reprioritized based on user feedback after Phase 5 ships (e.g., if teachers
ask for grading reports before rating systems, do Phase 7 before Phase 8).
Phase 12 is last by design — polish work assumes the feature surface is stable.

## 7. Non-goals (explicitly out of scope unless requested later)

- Building a custom WYSIWYG rich text editor — Markdown + preview is enough.
- Full MOSS-grade plagiarism detection — a winnowing-based similarity score
  is sufficient for teacher triage, not courtroom-grade proof.
- Video proctoring / webcam anti-cheat — out of scope for a university
  practice platform; tab-switch/fullscreen logging is the ceiling here.
- Supporting every competitive-programming language (Rust, Go, Kotlin, ...) —
  cap at C/C++/Python/Java/JS unless demand shows otherwise.
