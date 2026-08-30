# Phase 6 — Classroom, Courses & Gradebook

> **Execute with**: "execute Phase 6"
> **Effort**: 14–18 days · **Flag**: `classroom`
> **Depends on**: Phase 1, 2, 5 · **Unblocks**: 8, 10

---

## Goal

The differentiating half of the product: a teacher creates a course section,
imports a roster, publishes assignments and lab quizzes, tracks who is falling
behind, and exports a gradebook. Then clones the whole thing for next semester.

## Why now

Everything it needs now exists: roles and institutions (Phase 1), real problems
(Phase 2), a scoring engine including `assignment` (Phase 5), and a judge that
survives a whole section submitting at once (Phase 4). Building it earlier would
have meant re-implementing all four.

## Scope

- `Department`, `Course`, `CourseSection`, `Enrollment`, `Semester`
- Roster import: CSV, invite code, self-enrol with approval
- `Assignment` + `AssignmentProblem` with per-student deadlines and late policy
- Gradebook: computed + manual marks + overrides + export
- Section-scoped contests (the `ROSTER` join policy from Phase 5)
- TA delegation, scoped to a section
- Semester rollover: clone a section, keep the content, drop the students
- Student-facing: "My courses", assignment list, due-date awareness

---

## Design decisions

### D1 — Four levels, not one "Class"

v1 proposed a flat `Class`. That breaks at the first semester rollover and cannot
express "CSE 213 has six sections taught by three teachers".

```
Institution
  └── Department            "Computer Science & Engineering"
        └── Course          "CSE 213 — Data Structures"   (catalog entry, persists)
              └── CourseSection  "Fall 2026 · Section B"  (an instance, one term)
                    └── Enrollment (student | TA)
```

`Course` is the durable catalog entry — its problems, assignments and materials
are reusable across terms. `CourseSection` is one running instance with a
teacher, a term, and a roster. This is exactly how every university registrar
models it, which matters when a department eventually wants to import from theirs.

`Semester` is a small table (`Fall 2026`, `Spring 2027`, with start/end dates) per
institution, because Bangladeshi universities differ on tri-semester vs
bi-semester calendars and hardcoding either is wrong.

### D2 — An assignment is not a contest

The most consequential modelling decision in this phase, and the one v1 got
wrong by implying assignments are contests with a due date.

| | Contest | Assignment |
|---|---|---|
| Clock | One shared clock for everyone | A window (`opensAt` → `dueAt`), per-student extensions |
| Late work | Impossible | Accepted with a penalty, or with an extension |
| Ranking | Central | Absent or incidental |
| Scoring | Competitive (penalty, decay) | Weighted, partial credit, plus manual marks |
| Visibility of others | Live scoreboard | Usually none |
| Grade impact | None | It *is* the grade |

They share the judge, the problem set and the scoring interface — and nothing
else. Modelling them as one entity means every contest query carries assignment
concerns and vice versa.

A **lab quiz** — timed, ranked, graded — is a `Contest` with `joinPolicy: ROSTER`
and `sectionId` set, whose result feeds the gradebook as an assessment. That is
the bridge: `GradebookColumn` can source from either an `Assignment` or a
`Contest`.

### D3 — The gradebook is computed, with an override layer

Never store a computed grade as the source of truth — a rejudge would silently
change grades already reported. Instead:

- `GradebookColumn` defines *what* is graded (an assignment, a contest, or a
  manual column like "attendance") and its weight.
- Scores are **computed on read** from submissions via the `assignment` scoring
  engine.
- `GradeOverride` holds a teacher's explicit adjustment for one student × one
  column, with a reason and an author. Overrides always win and survive rejudges.
- `GradebookSnapshot` freezes the whole book at a point in time — what was
  submitted to the department at the end of term.

A teacher must be able to answer "why is this 7.5 and not 8?" and the answer must
be a chain: computed 8 → late by 6 hours → ×0.9 → 7.2 → manual +0.3 (partial
credit for approach) → 7.5.

### D4 — Roster import must be forgiving

The single most-used feature and the one that determines whether a teacher adopts
the platform. A registrar CSV in Bangladesh looks like:

```
Sl,Student ID,Name,Email,Program
1,221-15-4567,Md. Rafiul Islam,rafiul15-4567@diu.edu.bd,BSc CSE
```

The importer must:

- Detect the header row and map columns by fuzzy name (`Student ID` / `ID` /
  `Roll` / `Registration`), with a manual mapping UI when detection is ambiguous.
- Accept `.csv` and `.xlsx` (an `.xlsx` from a registrar is the common case; use
  a light SheetJS read, not a full Excel dependency).
- For each row: match an existing user by email; else by
  `(institutionId, studentId)`; else create a **pending invite**.
- A pending invite is a real row (`Enrollment` with `status: INVITED` and no
  `userId`) so the roster shows 60 students immediately, and links up
  automatically when each one registers with that email or student id.
- Report per-row outcomes: matched / invited / duplicate / invalid, downloadable
  as a CSV of just the failures.
- Be re-runnable — importing an updated roster adds new students without
  duplicating or removing existing ones (removals are explicit).

This is worth two full days on its own. A teacher whose 60-student roster imports
cleanly on the first try becomes a user; one who has to fix a CSV by hand does
not.

### D5 — TA permissions are section-scoped and non-destructive

`Enrollment.role = 'TA'` grants, **within that section only**: view all
submissions, answer clarifications, enter manual marks (which are recorded as
theirs), and view analytics. It never grants: changing weights, publishing
assignments, deleting anything, or exporting the final gradebook.

---

## Schema

```prisma
model Semester {
  id            String   @id @default(cuid())
  institutionId String
  name          String                    // "Fall 2026"
  code          String                    // "2026F"
  startsAt      DateTime
  endsAt        DateTime
  isCurrent     Boolean  @default(false)

  institution Institution     @relation(fields: [institutionId], references: [id], onDelete: Cascade)
  sections    CourseSection[]

  @@unique([institutionId, code])
}

model Department {
  id            String  @id @default(cuid())
  institutionId String
  name          String                     // "Computer Science & Engineering"
  shortName     String                     // "CSE"

  institution Institution @relation(fields: [institutionId], references: [id], onDelete: Cascade)
  courses     Course[]

  @@unique([institutionId, shortName])
}

model Course {
  id           String  @id @default(cuid())
  departmentId String
  code         String                      // "CSE 213"
  title        String                      // "Data Structures"
  description  String  @default("")
  credits      Float   @default(3)
  archived     Boolean @default(false)

  department Department      @relation(fields: [departmentId], references: [id], onDelete: Cascade)
  sections   CourseSection[]

  @@unique([departmentId, code])
}

model CourseSection {
  id          String   @id @default(cuid())
  courseId    String
  semesterId  String
  name        String                        // "Section B"
  teacherId   String
  inviteCode  String   @unique
  /// Students may self-enrol with the code without teacher approval.
  openEnroll  Boolean  @default(false)
  archived    Boolean  @default(false)
  /// Cloned-from pointer for semester rollover analytics.
  clonedFromId String?
  createdAt   DateTime @default(now())

  course      Course       @relation(fields: [courseId], references: [id], onDelete: Cascade)
  semester    Semester     @relation(fields: [semesterId], references: [id])
  teacher     User         @relation("SectionTeacher", fields: [teacherId], references: [id])
  enrollments Enrollment[]
  assignments Assignment[]
  columns     GradebookColumn[]
  contests    Contest[]

  @@unique([courseId, semesterId, name])
  @@index([teacherId, archived])
}

enum EnrollmentRole   { STUDENT TA }
enum EnrollmentStatus { INVITED ACTIVE DROPPED }

model Enrollment {
  id         String           @id @default(cuid())
  sectionId  String
  userId     String?                        // null while INVITED
  /// Identity from the roster, used to link a later registration.
  email      String?
  studentId  String?
  name       String?
  role       EnrollmentRole   @default(STUDENT)
  status     EnrollmentStatus @default(ACTIVE)
  joinedAt   DateTime?
  droppedAt  DateTime?
  createdAt  DateTime         @default(now())

  section CourseSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  user    User?         @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@unique([sectionId, userId])
  @@unique([sectionId, email])
  @@index([userId, status])
  @@index([email])
  @@index([studentId])
}

enum LatePolicy { NONE LINEAR GRACE_THEN_LINEAR REJECT }

model Assignment {
  id          String   @id @default(cuid())
  sectionId   String
  title       String
  descriptionMd String @default("")
  opensAt     DateTime?
  dueAt       DateTime?
  /// Submissions after this are rejected regardless of late policy.
  closesAt    DateTime?
  latePolicy  LatePolicy @default(NONE)
  /// LINEAR: percent lost per day. GRACE: hours of grace before linear starts.
  lateParam   Float      @default(0)
  /// Contribution to the final grade, relative to other columns.
  weight      Float      @default(1)
  published   Boolean    @default(false)
  /// Show classmates' progress (a light leaderboard) — off by default.
  showPeers   Boolean    @default(false)
  createdAt   DateTime   @default(now())

  section  CourseSection        @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  problems AssignmentProblem[]
  extensions AssignmentExtension[]
  column   GradebookColumn?

  @@index([sectionId, published, dueAt])
}

model AssignmentProblem {
  id               String @id @default(cuid())
  assignmentId     String
  problemId        String
  problemVersionId String
  order            Int    @default(0)
  points           Int    @default(100)
  /// Optional: this problem must be solved before later ones unlock.
  required         Boolean @default(true)

  assignment     Assignment     @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  problem        Problem        @relation(fields: [problemId], references: [id])
  problemVersion ProblemVersion @relation(fields: [problemVersionId], references: [id])

  @@unique([assignmentId, problemId])
  @@index([assignmentId, order])
}

model AssignmentExtension {
  id           String   @id @default(cuid())
  assignmentId String
  userId       String
  newDueAt     DateTime
  reason       String   @default("")
  grantedById  String
  createdAt    DateTime @default(now())

  assignment Assignment @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  user       User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([assignmentId, userId])
}

enum GradebookSource { ASSIGNMENT CONTEST MANUAL }

model GradebookColumn {
  id           String          @id @default(cuid())
  sectionId    String
  source       GradebookSource
  assignmentId String?         @unique
  contestId    String?
  title        String
  maxPoints    Float           @default(100)
  weight       Float           @default(1)
  order        Int             @default(0)
  /// Excluded from the total until the teacher publishes it.
  published    Boolean         @default(false)

  section    CourseSection   @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  assignment Assignment?     @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  overrides  GradeOverride[]

  @@index([sectionId, order])
}

model GradeOverride {
  id        String   @id @default(cuid())
  columnId  String
  userId    String
  points    Float
  reason    String   @default("")
  authorId  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  column GradebookColumn @relation(fields: [columnId], references: [id], onDelete: Cascade)
  user   User            @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([columnId, userId])
}

model GradebookSnapshot {
  id          String   @id @default(cuid())
  sectionId   String
  label       String                   // "Midterm submission to department"
  data        Json
  createdById String
  createdAt   DateTime @default(now())

  @@index([sectionId, createdAt])
}
```

Migration `0016_classroom`: all additive. No backfill — nothing existing maps to
courses. `Contest.sectionId` (added in Phase 5) gains its FK here.

---

## Gradebook computation

`src/lib/gradebook.ts`:

```ts
export type GradeCell = {
  columnId: string;
  raw: number | null;          // engine output before adjustments
  lateMultiplier: number;      // 1 when on time
  computed: number | null;     // raw × lateMultiplier
  override: number | null;
  final: number | null;        // override ?? computed
  status: "not-started" | "in-progress" | "submitted" | "late" | "graded" | "excused";
  submissionCount: number;
  bestSubmissionId: string | null;
};

export async function computeGradebook(sectionId: string, opts?: {
  columnIds?: string[]; userIds?: string[];
}): Promise<{ students: StudentRow[]; columns: ColumnMeta[]; totals: Totals }>;
```

Late multiplier:

| Policy | Multiplier |
|---|---|
| `NONE` | 1 before `dueAt`, 0 after |
| `LINEAR` | `max(0, 1 − lateParam/100 × daysLate)` |
| `GRACE_THEN_LINEAR` | 1 within `lateParam` hours, then linear at 10%/day |
| `REJECT` | 1 before `dueAt`; submissions after are refused at the API |

Per-student extensions shift `dueAt` before any of this applies.

**Performance**: a 60-student × 12-column gradebook is 720 cells, each needing
that student's best submission per problem. Naively that is thousands of queries.
Compute it as **three** queries — enrollments, columns with their problems, and
one aggregate over submissions grouped by `(userId, problemId)` — then assemble
in memory. Cache per section, invalidated on any submission in the section or on
any override write. Budget: 400 ms p95 for 60 × 12.

---

## Roster import

`src/lib/roster.ts`:

```ts
export type RosterRow = {
  line: number;
  email?: string; studentId?: string; name?: string;
  outcome: "matched" | "invited" | "duplicate" | "invalid";
  reason?: string;
  userId?: string;
};

export function parseRoster(file: Buffer, filename: string): {
  detectedColumns: Record<string, number>;
  rows: RawRow[];
  warnings: string[];
};

export async function applyRoster(sectionId: string, rows: RawRow[], opts: {
  mapping: ColumnMapping;
  dryRun: boolean;
  removeMissing: boolean;     // default false
}): Promise<{ rows: RosterRow[]; summary: Summary }>;
```

Always a two-step UI: upload → preview table with detected mapping and per-row
outcome → confirm. Never import on upload.

Invite linking runs at three points: at import (match existing users), on
registration (`matchPendingEnrollments(user)`), and on demand from the roster
page ("re-check invites"). The registration hook matches on verified email first,
then on `(institutionId, studentId)`.

---

## API contracts

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET/POST` | `/api/teacher/courses` | teacher | Course catalog within the teacher's department |
| `GET/POST` | `/api/teacher/sections` | teacher | Sections; `POST` creates with an invite code |
| `GET` | `/api/teacher/sections/[id]` | section teacher/TA | Section detail + roster |
| `POST` | `/api/teacher/sections/[id]/roster/preview` | teacher | Multipart upload → parsed preview, no writes |
| `POST` | `/api/teacher/sections/[id]/roster/apply` | teacher | Commits a previewed mapping |
| `GET` | `/api/teacher/sections/[id]/roster.csv` | teacher | Export current roster |
| `PATCH` | `/api/teacher/sections/[id]/enrollments/[eid]` | teacher | Role change, drop, re-invite |
| `POST` | `/api/teacher/sections/[id]/clone` | teacher | Semester rollover |
| `GET/POST` | `/api/teacher/sections/[id]/assignments` | teacher | — |
| `PATCH` | `/api/teacher/assignments/[id]` | teacher | Publish, edit, reorder problems |
| `POST` | `/api/teacher/assignments/[id]/extensions` | teacher/TA | `{ userId, newDueAt, reason }` |
| `GET` | `/api/teacher/sections/[id]/gradebook` | teacher/TA | Computed grid |
| `PUT` | `/api/teacher/sections/[id]/gradebook/override` | teacher/TA | `{ columnId, userId, points, reason }` |
| `GET` | `/api/teacher/sections/[id]/gradebook.csv` | teacher | Export |
| `POST` | `/api/teacher/sections/[id]/gradebook/snapshot` | teacher | Freeze |
| `POST` | `/api/sections/join` | student | `{ inviteCode }` |
| `GET` | `/api/me/sections` | student | Enrolled sections |
| `GET` | `/api/me/assignments` | student | Upcoming + overdue across all sections |

---

## Frontend surfaces

### Teacher

| Route | Content |
|---|---|
| `/teacher` *(new)* | Dashboard: my sections this semester, assignments due soon, submissions needing attention, at-risk students |
| `/teacher/courses` | Course catalog CRUD |
| `/teacher/sections/[id]` | Overview: roster count, assignment list, recent activity, invite code with a copyable link and a QR code for projecting in class |
| `/teacher/sections/[id]/roster` | Table with status pills; import wizard; invite management; bulk actions |
| `/teacher/sections/[id]/assignments` | List + create; drag-order problems; publish toggle |
| `/teacher/sections/[id]/assignments/[aid]` | Per-assignment view: who has started/submitted/passed, per-problem AC counts, extension management |
| `/teacher/sections/[id]/gradebook` | The grid. Sticky first column and header, per-cell drill-down to submissions, inline override with a reason, weight editor, CSV export |
| `/teacher/sections/[id]/students/[uid]` | Per-student view within this section (extended in Phase 8) |

### Student

| Route | Content |
|---|---|
| `/courses` *(new)* | My sections; join by code |
| `/courses/[sectionId]` | Assignments with due dates and status; my grades if published |
| `/courses/[sectionId]/assignments/[aid]` | Problem list with per-problem status; deadline countdown; late-penalty warning |
| Nav | An "Assignments" indicator when something is due within 48 h |

The gradebook grid is the highest-value screen in the entire platform for the
teacher persona. Make it good: keyboard navigation between cells, a cell that
shows the computation chain on hover, and an export that opens correctly in
Excel with Bangla names intact (UTF-8 BOM — this is a real and commonly-missed
detail).

---

## Semester rollover

`POST /api/teacher/sections/[id]/clone` with options:

- [x] Assignments (problems, weights, late policy) — deadlines shifted by the
      difference between the two semesters' start dates
- [x] Gradebook columns and weights
- [x] TAs
- [ ] Students (off by default — a new semester means a new roster)
- [ ] Contests

This turns "set up next semester" from two hours into two minutes and is the
single strongest retention mechanic for the teacher persona.

---

## Testing plan

| Tier | Test |
|---|---|
| Unit | Late multiplier for all four policies at boundaries (exactly `dueAt`, 1 s after, mid-grace, past floor) |
| Unit | Extension overrides the section deadline for that student only |
| Unit | Gradebook totals with mixed weights, unpublished columns excluded, overrides winning |
| Unit | Roster parsing: registrar CSV, xlsx, missing headers, duplicate emails, Bangla names, BOM, CRLF |
| Integration | Import 60 rows → 40 matched, 18 invited, 2 invalid; invited students link on registration |
| Integration | Re-import an updated roster → 5 new invited, 0 duplicates, existing untouched |
| Integration | TA can enter a manual mark but cannot publish an assignment or change weights |
| Integration | A student not enrolled cannot see or submit to a `ROSTER` contest |
| Integration | Rejudge changes a computed grade but not an overridden one |
| Perf | 60 students × 12 columns gradebook in ≤ 400 ms p95, ≤ 5 queries |
| Integration | Clone a section: assignments copied with shifted dates, roster empty |

---

## Acceptance criteria

1. A teacher creates CSE 213 Section B for Fall 2026 and imports a 60-student
   registrar CSV in under three minutes, seeing exactly which rows failed and why.
2. A student who registers a week later is automatically linked to their pending
   invite and sees the section without doing anything.
3. An assignment with a 10%/day late policy scores a submission 26 hours late at
   80%, and the gradebook shows the chain.
4. A per-student extension moves only that student's deadline.
5. A TA answers clarifications and enters manual marks; they cannot publish or
   change weights, verified by a test not just by the UI.
6. The gradebook exports as CSV that opens in Excel with Bangla names correct.
7. A lab quiz run as a `ROSTER` contest appears as a gradebook column and
   contributes to the total.
8. Cloning a section for the next semester carries assignments with shifted dates
   and an empty roster.
9. Overrides survive a rejudge.

## Rollback

`classroom` off hides all classroom routes and nav. Data is additive and
untouched by other subsystems except `Contest.sectionId`, which is nullable.

## Risks

| Risk | Mitigation |
|---|---|
| Roster import fails on a real registrar file | Collect three real (anonymised) files from DIU before building; test against all three; ship the manual column mapper as the escape hatch |
| Gradebook slow on a big section | Three-query computation with an assembly step; per-section cache; measured budget in tests |
| A rejudge changes grades already reported to the department | `GradebookSnapshot` before any submission to the department; rejudge on a section with a snapshot warns loudly |
| Teachers expect full LMS features (attendance, materials, quizzes) | Explicitly out of scope; the gradebook has a `MANUAL` column type as the pressure valve |
| Duplicate students across sections skew stats | Enrollment is per section by design; user-level stats de-duplicate |
| Invite emails go to spam | Invite code + copyable link + QR shown in class; email is a convenience, never the only path |

## Definition of done

- [ ] Semester/Department/Course/CourseSection/Enrollment live
- [ ] Roster import: CSV + xlsx, fuzzy mapping, preview, per-row outcomes, re-runnable
- [ ] Pending invites link automatically on registration
- [ ] Assignments with open/due/close, four late policies, per-student extensions
- [ ] Gradebook computed in ≤ 5 queries with overrides, weights, and snapshots
- [ ] UTF-8 BOM CSV export verified in Excel
- [ ] Section-scoped (`ROSTER`) contests feeding gradebook columns
- [ ] TA role scoped and enforced
- [ ] Semester rollover clone
- [ ] Student course + assignment surfaces with deadline awareness
