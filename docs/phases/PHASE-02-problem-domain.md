# Phase 2 — Problem Domain

> **Execute with**: "execute Phase 2"
> **Effort**: 14–18 days · **Flag**: `problemDb`
> **Depends on**: Phase 0, 1 · **Unblocks**: 3, 5, 6, 8, 10, 11, 15

---

## Goal

Turn problems from a static JSON file into first-class, versioned database
entities with real test data in object storage, a tag taxonomy, an authoring UI
for teachers, and a setter review workflow — while keeping all 700 existing
problems, every existing submission, and every existing URL working.

## Why now

This is the keystone migration and the most important resequencing in the plan
(v1 had it at Phase 4, after classes and private contests).

`ContestProblem.problemId` and `Submission.problemId` are today unconstrained
strings pointing at keys in `data/problems.json`. There is no `Problem` table at
all. Consequences that block nearly everything downstream:

- Teachers cannot author problems — the core of the brief.
- No tags → no weak-topic analytics (Phase 8), no recommendations (Phase 15).
- No versions → rejudging after a test-data fix silently rewrites history, and
  past contests are irreproducible.
- No subtasks → no IOI-style partial scoring (Phase 5).
- No referential integrity → a deleted problem leaves orphaned submissions.
- No editorial/discussion anchor (Phase 11), no per-problem difficulty from solve
  data (Phase 15), no plagiarism grouping by problem (Phase 10).

Building classes and contests against the string-keyed model first, as v1
proposed, means writing that code twice.

## Scope

- `Problem`, `ProblemVersion`, `TestGroup`, `TestCase`, `Tag`, `ProblemTag`,
  `ProblemStats`, `ReferenceSolution`
- Blob storage abstraction (R2 in prod, filesystem in dev)
- Import of all 700 bank problems, preserving ids
- FK-ing `ContestProblem` and `Submission` to real rows
- Teacher authoring UI: statement (Markdown + KaTeX), test data, settings
- Bulk test-data upload (zip of `.in`/`.out`)
- Setter workflow: DRAFT → IN_REVIEW → PUBLISHED → ARCHIVED, with a
  reference-solution gate
- Public archive filtering by tag, difficulty, solved-state

---

## Design decisions

### D1 — Problem identity vs. problem content: two tables

`Problem` is the stable identity (slug, ownership, visibility, lifecycle).
`ProblemVersion` is the immutable content (statement, limits, checker, test
manifest). A contest pins `contestProblem.problemVersionId`.

Why this matters concretely: a teacher discovers on Tuesday that test 7 of last
week's quiz had a wrong expected output. They fix it. Without versioning, the
scoreboard of last week's quiz silently changes and there is no record of what it
said. With versioning, the fix creates version 2; the quiz still references
version 1; the teacher explicitly chooses to rejudge onto version 2 and that
decision is recorded.

`DRAFT` versions are mutable in place (no point creating a version per keystroke).
A version becomes immutable the moment it is `PUBLISHED` or referenced by a
contest.

### D2 — Test data lives in object storage, not Postgres

v1 proposed `TestCase.input String` / `expected String`. That is wrong at scale: a
graph problem's test file is routinely 1–10 MB, Postgres TOASTs it, and every
`SELECT *` on the table drags it through the connection. Neon bills for it twice
(storage and egress).

Instead: `TestCase` holds `inputKey`, `expectedKey`, `inputHash`,
`expectedHash`, `inputBytes`, `expectedBytes`. Blobs live in R2 under
`tests/{problemId}/{versionId}/{caseId}.in`. Content-addressed by hash so
identical test data across versions is stored once.

`src/lib/blob.ts` abstracts it with two drivers so local development needs no
cloud account:

```ts
export interface BlobStore {
  put(key: string, body: Buffer | string, meta?: { contentType?: string }): Promise<{ key: string; hash: string; bytes: number }>;
  get(key: string): Promise<Buffer>;
  getStream(key: string): Promise<ReadableStream>;
  signedUrl(key: string, ttlSec: number): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
```

`BLOB_DRIVER=fs` writes under `.data/blobs/` for dev; `s3` for R2.

**Small-test fast path**: cases under 4 KB *also* store the content inline
(`inputInline`, `expectedInline`) to avoid a round trip for the 90% of problems
whose tests are tiny. The worker prefers inline when present. This is a
measurable win in the judge hot path and costs one nullable column.

### D3 — `TestGroup` sits between problem and test

Subtasks, partial scoring, and "run the samples first" all need a grouping level.

```
ProblemVersion
  └── TestGroup(order=0, name="samples", points=0, isSample=true)
  └── TestGroup(order=1, name="subtask 1: n ≤ 100", points=30)
  └── TestGroup(order=2, name="subtask 2: n ≤ 10^5", points=70, dependsOn=[1])
        └── TestCase × k
```

`dependsOn` encodes IOI-style subtask dependency (group 2 is only scored if
group 1 passed). A problem with no subtasks gets exactly two groups: samples and
`main` worth 100. Uniform shape, no special cases in the scorer.

### D4 — Preserving existing ids is non-negotiable

`Submission.problemId` and `SolvedProblem.problemId` contain 700 values like
`set1-q1`, and `/problems/set1-q1` is an indexed URL. The import therefore:

- Sets `Problem.slug = "set1-q1"` — URLs and existing rows keep resolving.
- Sets `Problem.id` to a fresh cuid.
- Adds `Submission.problemRefId` / `SolvedProblem.problemRefId` (nullable FK) and
  backfills it by joining on `problemId = slug`.
- Keeps the string `problemId` column permanently as a denormalised slug — it is
  genuinely useful for reads and avoids a lock-heavy contract step on the largest
  table in the system.

That last point is a deliberate departure from strict normalisation. Dropping a
column from `Submission` requires a full table rewrite; keeping a 12-byte slug
alongside the FK does not, and the slug is immutable anyway.

### D5 — Markdown + KaTeX, rendered server-side, sanitised

Statement authoring is Markdown with `$...$` / `$$...$$` math. Rendered with
`unified` + `remark-parse` + `remark-math` + `rehype-katex` + `rehype-sanitize`,
**server-side**, cached. Rejected: a WYSIWYG editor (Master Plan non-goals);
rejected: client-side rendering (statement is the most-viewed content on the site
and must be in the RSC payload for SEO and for slow devices).

Sanitisation is not optional — teacher-authored HTML is untrusted input that
reaches every student in a section.

### D6 — A problem cannot be published without a passing reference solution

The gate that separates a judge from a toy. Before `PUBLISHED`:

1. At least one `ReferenceSolution` with `expectedVerdict: AC` must actually
   judge as `AC` against every test.
2. Every test's expected output must match what the reference solution produces
   (or be explicitly marked `manualExpected`).
3. Optionally, a `expectedVerdict: TLE` brute-force solution must actually TLE —
   which proves the time limit discriminates.

This runs as a judge job (Phase 3/4). Until Phase 3 lands, the gate runs against
the existing C judge and only for C reference solutions; Phase 3 generalises it.

---

## Schema

```prisma
enum ProblemStatus {
  DRAFT
  IN_REVIEW
  PUBLISHED
  ARCHIVED
}

enum ProblemVisibility {
  PUBLIC        // in the open archive, solvable without login
  INSTITUTION   // visible to the author's institution only
  PRIVATE       // author + explicitly granted contests/sections only
}

enum CheckerType {
  EXACT         // byte-identical after trailing-whitespace normalisation
  TOKEN         // whitespace-insensitive token comparison (the sane default)
  FLOAT         // numeric comparison within epsilon
  SPECIAL       // custom checker program
  INTERACTIVE   // interactor process drives the submission
}

model Problem {
  id            String            @id @default(cuid())
  /// Stable public identifier. Legacy bank problems keep "set1-q1".
  slug          String            @unique
  title         String
  status        ProblemStatus     @default(DRAFT)
  visibility    ProblemVisibility @default(PRIVATE)
  authorId      String
  institutionId String?
  /// Points at the version served to solvers. Null while unpublished.
  currentVersionId String?        @unique
  /// Author's difficulty label; Phase 15 adds a computed one alongside.
  difficulty    Difficulty        @default(EASY)
  /// Denormalised from the legacy bank for archive browsing continuity.
  legacySet     Int?
  legacyQuestion Int?
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  author         User             @relation("ProblemAuthor", fields: [authorId], references: [id])
  institution    Institution?     @relation(fields: [institutionId], references: [id], onDelete: SetNull)
  currentVersion ProblemVersion?  @relation("CurrentVersion", fields: [currentVersionId], references: [id])
  versions       ProblemVersion[] @relation("AllVersions")
  tags           ProblemTag[]
  stats          ProblemStats?
  contestUses    ContestProblem[]
  submissions    Submission[]
  solves         SolvedProblem[]

  @@index([status, visibility, difficulty])
  @@index([authorId, status])
  @@index([institutionId])
}

model ProblemVersion {
  id            String      @id @default(cuid())
  problemId     String
  version       Int
  /// Immutable once published or referenced by a contest.
  frozen        Boolean     @default(false)

  statementMd   String                        // Markdown + KaTeX
  statementBn   String?                       // Bangla statement (Phase 14)
  inputSpec     String      @default("")
  outputSpec    String      @default("")
  constraints   String      @default("")
  notes         String      @default("")
  starterCode   Json        @default("{}")    // { "c": "...", "cpp20": "..." }

  timeLimitMs   Int         @default(2000)
  memoryLimitMb Int         @default(256)
  outputLimitKb Int         @default(512)

  checkerType   CheckerType @default(TOKEN)
  checkerEps    Float?                        // FLOAT only
  checkerCode   String?                       // SPECIAL/INTERACTIVE source
  checkerLang   String?

  /// Sum of all non-sample group points; cached for the scorer.
  maxScore      Int         @default(100)

  createdById   String
  createdAt     DateTime    @default(now())
  publishedAt   DateTime?

  problem       Problem     @relation("AllVersions", fields: [problemId], references: [id], onDelete: Cascade)
  currentOf     Problem?    @relation("CurrentVersion")
  groups        TestGroup[]
  references    ReferenceSolution[]
  contestUses   ContestProblem[]

  @@unique([problemId, version])
  @@index([problemId, frozen])
}

model TestGroup {
  id               String  @id @default(cuid())
  problemVersionId String
  order            Int     @default(0)
  name             String  @default("main")
  points           Int     @default(100)
  isSample         Boolean @default(false)
  /// IOI subtask dependencies: this group scores 0 unless all listed groups pass.
  dependsOn        Int[]   @default([])
  /// Stop running this group's tests after the first failure.
  stopOnFail       Boolean @default(true)

  version   ProblemVersion @relation(fields: [problemVersionId], references: [id], onDelete: Cascade)
  cases     TestCase[]

  @@unique([problemVersionId, order])
}

model TestCase {
  id             String  @id @default(cuid())
  testGroupId    String
  order          Int     @default(0)
  label          String  @default("")

  /// Blobs > 4 KB live in object storage; smaller ones are inlined.
  inputKey       String?
  expectedKey    String?
  inputInline    String?
  expectedInline String?
  inputHash      String
  expectedHash   String
  inputBytes     Int     @default(0)
  expectedBytes  Int     @default(0)
  /// Expected output was hand-written rather than produced by a reference solution.
  manualExpected Boolean @default(false)

  group TestGroup @relation(fields: [testGroupId], references: [id], onDelete: Cascade)

  @@unique([testGroupId, order])
  @@index([inputHash])
}

model ReferenceSolution {
  id               String   @id @default(cuid())
  problemVersionId String
  language         String
  source           String
  /// What this solution is supposed to do — the publish gate asserts it.
  expectedVerdict  Verdict  @default(AC)
  note             String   @default("")
  lastVerdict      Verdict?
  lastCheckedAt    DateTime?
  lastMaxCpuMs     Int?

  version ProblemVersion @relation(fields: [problemVersionId], references: [id], onDelete: Cascade)

  @@index([problemVersionId])
}

model Tag {
  id       String  @id @default(cuid())
  slug     String  @unique              // "dynamic-programming"
  name     String                        // "Dynamic Programming"
  nameBn   String?
  category String  @default("topic")     // topic | technique | datastructure | meta
  /// Tags that reveal the solution are hidden until a user solves the problem.
  spoiler  Boolean @default(true)

  problems ProblemTag[]
  @@index([category])
}

model ProblemTag {
  problemId String
  tagId     String
  /// Author confidence 1–3; Phase 15 adds crowd-sourced tags at lower weight.
  weight    Int     @default(3)

  problem Problem @relation(fields: [problemId], references: [id], onDelete: Cascade)
  tag     Tag     @relation(fields: [tagId], references: [id], onDelete: Cascade)
  @@id([problemId, tagId])
  @@index([tagId])
}

model ProblemStats {
  problemId     String   @id
  attempts      Int      @default(0)
  accepted      Int      @default(0)
  distinctUsers Int      @default(0)
  distinctSolvers Int    @default(0)
  /// Computed difficulty (Phase 15). Author label stays on Problem.
  eloDifficulty Int?
  avgAttemptsToAc Float?
  updatedAt     DateTime @updatedAt

  problem Problem @relation(fields: [problemId], references: [id], onDelete: Cascade)
  @@index([accepted])
}

model Submission {
  // ...existing
  /// FK to the real row. The string problemId stays as a denormalised slug.
  problemRefId     String?
  problemVersionId String?
  problemRef       Problem?        @relation(fields: [problemRefId], references: [id], onDelete: SetNull)
  @@index([problemRefId, verdict])
}

model SolvedProblem {
  // ...existing
  problemRefId String?
  problemRef   Problem? @relation(fields: [problemRefId], references: [id], onDelete: Cascade)
}

model ContestProblem {
  // ...existing
  problemRefId     String?
  /// Pinning the version is what makes a past contest reproducible.
  problemVersionId String?
  problemRef       Problem?        @relation(fields: [problemRefId], references: [id])
  problemVersion   ProblemVersion? @relation(fields: [problemVersionId], references: [id])
}
```

### Migration plan

| Migration | Step | Contents |
|---|---|---|
| `0007_problem_domain` | expand | All new tables; nullable FK columns on `Submission`, `SolvedProblem`, `ContestProblem` |
| `scripts/migrations/0008-import-problem-bank.ts` | backfill | Import 700 problems → `Problem` + v1 `ProblemVersion` + groups + cases; upload blobs; derive tags |
| `scripts/migrations/0009-link-problem-refs.ts` | backfill | `UPDATE Submission SET problemRefId = p.id FROM Problem p WHERE p.slug = Submission.problemId` — batched at 1000 rows with a cursor |
| `0010_problem_constraints` | contract | Add FK constraints `NOT VALID`, then `VALIDATE CONSTRAINT`; index cleanup |

Reconciliation (must return 0):

```sql
SELECT count(*) FROM "Submission" s
WHERE s."problemRefId" IS NULL
  AND EXISTS (SELECT 1 FROM "Problem" p WHERE p.slug = s."problemId");
```

---

## The import: `scripts/migrations/0008-import-problem-bank.ts`

Reads `data/problems.json`. For each of the 700 problems:

```
Problem {
  slug: problem.id,                   // "set1-q1"  ← URL and FK continuity
  title, difficulty,
  status: PUBLISHED,
  visibility: PUBLIC,
  authorId: <the seeded platform account>,
  legacySet: problem.set, legacyQuestion: problem.question,
}
ProblemVersion v1 {
  statementMd:  compose(statement, input, output, constraints, notes),
  inputSpec:    problem.input,
  outputSpec:   problem.output,
  constraints:  problem.constraints,
  starterCode:  { c: problem.starterCode },
  timeLimitMs:  problem.timeLimitMs,
  memoryLimitMb: problem.memoryLimitMb,
  checkerType:  TOKEN,                // the current judge normalises whitespace
  frozen: true, publishedAt: now,
}
TestGroup 0 "samples" isSample=true points=0
  ← problem.tests.filter(t => t.sample)  (plus sampleInput/sampleOutput if absent)
TestGroup 1 "main" points=100
  ← problem.tests.filter(t => !t.sample)
```

Key details:

- **Checker choice**: the existing `normalizeOutput()` strips trailing whitespace
  per line and at the end — that is `TOKEN`-ish but not identical. Import as
  `TOKEN` and add a conformance step: re-judge a sample of 50 problems' reference
  solutions under the new checker and assert identical verdicts. Any mismatch
  gets imported as `EXACT` instead. **Do not skip this check** — silently changing
  every problem's checker semantics is exactly the kind of change that produces
  angry students.
- **`openEnded` problems** (no tests) import with only a samples group and
  `status: PUBLISHED`, `maxScore: 0`; the judge continues to return `SKIP`.
- **Tag derivation**: seed a taxonomy of ~40 tags and map from `setTitle`
  (e.g. "I/O & Arithmetic Basics" → `implementation`, `math`) and from the
  `topic` field where present. Machine-derived tags get `weight: 1` so a human
  can override. Phase 15 improves them.
- **Idempotent**: keyed on `slug`; re-running updates rather than duplicating.
- **Resumable**: a cursor file so a failure at problem 431 does not restart.
- **Dry-run mode** printing a diff summary before writing anything.

Also import the two "sample" fields into the samples group when
`problem.tests` has no `sample: true` entries — several bank problems carry
samples only in `sampleInput`/`sampleOutput`.

After import, `src/lib/problems.ts` flips to DB-backed behind the `problemDb`
flag, keeping the same exported function signatures so the ~15 call sites do not
change in this phase:

```ts
export async function getProblem(idOrSlug: string): Promise<ProblemView | null>;
export async function getBank(): Promise<ProblemBank>;      // now a cached query
export async function getSets(): Promise<SetSummary[]>;
export async function getCategories(): Promise<CategorySummary[]>;
```

These become `async`. That is the one breaking change and it ripples into the
pages that call them — all server components, so `await` is the whole fix. Keep
the JSON file in the repo as a disaster-recovery seed, not as a runtime source.

---

## Backend modules

| File | Responsibility |
|---|---|
| `src/lib/blob.ts` | `BlobStore` interface, `s3` + `fs` drivers, content-addressed keys |
| `src/lib/problems.ts` | Rewritten: DB-backed reads, caching, view assembly |
| `src/lib/problem-authoring.ts` | Create/update problem + version, freeze rules, publish gate |
| `src/lib/testdata.ts` | Zip parsing, `.in`/`.out` pairing, validation, blob upload, hash dedupe |
| `src/lib/statement.ts` | Markdown+KaTeX → sanitised HTML, server-cached by version id |
| `src/lib/tags.ts` | Taxonomy, spoiler gating, tag search |
| `src/lib/problem-stats.ts` | Rollup job updating `ProblemStats` |

### Test-data upload rules (`testdata.ts`)

- Accepts a `.zip` with `1.in`/`1.out`, `01.in`/`01.a`, or `input1.txt`/`output1.txt`
  conventions — detected, not configured.
- Pairs by basename; an unpaired file is a hard error listing the filename.
- Max 200 cases and 256 MB per upload; per-file max 64 MB.
- Rejects paths with `..` or absolute components (zip-slip).
- Normalises line endings to `\n` and ensures a trailing newline on input.
- Computes SHA-256; identical content across cases/versions reuses one blob.
- Streams to storage — never buffers the whole zip in memory.

---

## API contracts

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/problems` | public | Filter: `tag`, `difficulty`, `status=solved\|unsolved`, `q`, cursor |
| `GET` | `/api/problems/[slug]` | public | Statement, samples, limits; hidden tests never included |
| `POST` | `/api/teacher/problems` | teacher | Creates problem + draft v1 |
| `GET` | `/api/teacher/problems` | teacher | Own problems (admin: all) |
| `PATCH` | `/api/teacher/problems/[id]` | owner | Identity fields (title, visibility, tags) |
| `POST` | `/api/teacher/problems/[id]/versions` | owner | Fork the current version into a new draft |
| `PATCH` | `/api/teacher/problems/[id]/versions/[vid]` | owner | Edit a draft; 409 if frozen |
| `POST` | `/api/teacher/problems/[id]/versions/[vid]/groups` | owner | Create/reorder groups |
| `POST` | `/api/teacher/problems/[id]/versions/[vid]/tests` | owner | Multipart zip or JSON rows |
| `DELETE` | `/api/teacher/problems/[id]/versions/[vid]/tests/[tid]` | owner | — |
| `POST` | `/api/teacher/problems/[id]/versions/[vid]/references` | owner | Add reference solution |
| `POST` | `/api/teacher/problems/[id]/versions/[vid]/validate` | owner | Run all reference solutions; returns the publish gate result |
| `POST` | `/api/teacher/problems/[id]/versions/[vid]/publish` | owner | Freeze + set `currentVersionId`; 422 if the gate fails |
| `POST` | `/api/teacher/problems/[id]/submit-review` | owner | DRAFT → IN_REVIEW |
| `POST` | `/api/admin/problems/[id]/review` | admin | Approve/reject with notes |
| `GET` | `/api/tags` | public | Taxonomy |

**Hidden test data is never served to a non-owner.** The publish gate result
returns per-test verdicts to the owner but the *content* only via a separate
owner-only signed URL, so an accidental client-side leak in the review UI cannot
expose it.

---

## Frontend surfaces

| Route | Work |
|---|---|
| `app/problems/page.tsx` | Rebuilt on DB: tag chips, difficulty filter, solved/unsolved, search, cursor pagination |
| `app/problems/[id]/page.tsx` | Server-rendered statement HTML; tags (spoiler-gated); stats bar (attempts, AC rate); sample cases |
| `app/teacher/problems/page.tsx` *(new)* | Author's problem list with status pills and version count |
| `app/teacher/problems/new/page.tsx` *(new)* | Create form |
| `app/teacher/problems/[id]/edit/page.tsx` *(new)* | Tabbed editor: Statement · Tests · Solutions · Settings · Publish |
| `components/problem/StatementEditor.tsx` *(new)* | Markdown textarea + live preview split pane, KaTeX, image paste → blob upload |
| `components/problem/TestDataTable.tsx` *(new)* | Group accordions, per-case rows, inline edit for small cases, drag reorder, zip upload with per-file errors |
| `components/problem/PublishGate.tsx` *(new)* | Reference-solution results, blocking checklist, "publish anyway" for admins only |
| `components/problem/TagPicker.tsx` *(new)* | Autocomplete over the taxonomy |
| `app/admin/problems/page.tsx` | Extended with the review queue |

The statement editor is where a teacher spends the most time; invest in the
details — a live preview that does not lose scroll position, drag-and-drop image
upload, and a "copy from existing problem" starter.

---

## Testing plan

| Tier | Test |
|---|---|
| Unit | `testdata.ts` — all three naming conventions; unpaired file error; zip-slip rejected; CRLF normalised; hash dedupe |
| Unit | `statement.ts` — `<script>` stripped; KaTeX renders; a malicious `onerror` attribute removed |
| Unit | Freeze rules — editing a frozen version throws `ConflictError`; forking creates version n+1 |
| Unit | Publish gate — fails with no reference solution, fails when the AC reference does not AC, passes otherwise |
| Integration | Full authoring flow: create → 5 tests (2 sample) → reference solution → validate → publish → visible in the archive |
| Integration | Hidden test content is not in any non-owner response body (assert on the serialised JSON) |
| Migration | Import into an empty DB: 700 problems, correct group/case counts, blob round-trip |
| Migration | Checker conformance: 50 sampled problems produce identical verdicts pre/post import |
| Migration | Run the import twice → no duplicates; run link-refs twice → same result |
| Integration | `/problems/set1-q1` still resolves; an existing submission still shows its problem title |

---

## Acceptance criteria

1. All 700 bank problems exist as `Problem` + frozen `ProblemVersion` v1 with
   grouped test cases, and every legacy URL still resolves.
2. Every pre-existing `Submission` and `SolvedProblem` row is linked to a real
   problem; the reconciliation query returns 0.
3. A teacher authors a problem end-to-end — statement with LaTeX, 6 tests across
   2 subtasks, a reference solution — and publishes it, in under 10 minutes,
   without touching the database.
4. Publishing is blocked when the reference solution does not produce the
   declared verdict, with a per-test explanation.
5. Uploading a 50-case zip reports per-file validation errors and imports the
   valid remainder only on explicit confirmation.
6. Hidden test data is unreachable by any non-owner request.
7. The archive filters by tag and difficulty and shows solved state for the
   signed-in user.
8. A frozen version cannot be edited; forking produces v2 while contests still
   point at v1.

## Rollback

The `problemDb` flag switches `problems.ts` back to the JSON reader. New tables
are additive; the FK columns are nullable. A rollback after teachers have
authored problems loses only the *display* of those problems, not the data —
which is why the flag flips reads, never writes.

## Risks

| Risk | Mitigation |
|---|---|
| Checker semantics change silently during import | The 50-problem conformance check is a blocking migration step, not a follow-up |
| Import corrupts or loses problems | Dry-run diff; JSON stays in the repo; import is idempotent and reversible by truncating the new tables |
| `getProblem` becoming async breaks pages | Compile-time caught by `tsc --noEmit`; all call sites are server components |
| Blob storage misconfigured in production | Startup health check asserts a put/get/delete round trip; `/admin/system` shows blob status |
| Teacher-authored HTML XSS | `rehype-sanitize` with an explicit allowlist; a unit test per known payload class |
| Statement rendering slows the problem page | Rendered HTML cached by `problemVersionId` (immutable ⇒ infinite TTL) |
| Large test uploads exhaust memory | Streaming zip parse; hard size caps enforced before parsing |

## Definition of done

- [ ] Seven new models live; FKs added and validated
- [ ] 700 problems imported, verified by count and by checker conformance
- [ ] `Submission`/`SolvedProblem`/`ContestProblem` linked; reconciliation clean
- [ ] `blob.ts` with both drivers; production round-trip health check green
- [ ] Teacher authoring UI complete: statement, tests, references, publish gate
- [ ] Zip upload with all three conventions and per-file errors
- [ ] Tag taxonomy seeded (~40 tags) with spoiler gating
- [ ] Archive rebuilt on the DB with filters
- [ ] Setter review workflow (DRAFT → IN_REVIEW → PUBLISHED) live
- [ ] `data/problems.json` demoted to a seed artifact and documented as such
