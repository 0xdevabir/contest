# Phase 10 — Academic Integrity

> **Execute with**: "execute Phase 10"
> **Effort**: 12–16 days · **Flag**: `integrity`
> **Depends on**: Phase 3, 4, 6 · **Unblocks**: teachers running graded online exams

---

## Goal

Give a teacher enough confidence to run a graded exam online: similarity
detection that finds copied code across a semester, exam telemetry that shows who
left the tab, session binding that stops account sharing, and — the strongest
control — **per-student parameterised problem variants** that make copying a
neighbour's answer produce a wrong answer.

## Why now

Phase 6 put grades on the platform. The first time a teacher runs a graded quiz
they will ask "how do I know they didn't copy?" Without a good answer they run the
exam on paper and the classroom half of the product dies.

## Scope

- Winnowing fingerprints computed at judge time, indexed for fast search
- Similarity search across contest, section, semester and history
- Integrity console: ranked pairs, side-by-side diff, disposition workflow
- Proctoring-lite: blur/visibility/paste/fullscreen telemetry
- Single-session binding for strict-mode contests
- **Parameterised problem variants** — the differentiator
- Integrity report per exam

## What this is not

Per the Master Plan non-goals: no webcam, no screen recording, no browser
lockdown, no automatic penalties. Every signal here is **triage for a human**.
The system ranks pairs and shows evidence; a teacher decides. Say this in the UI —
a tool that appears to accuse students automatically will be distrusted by both
teachers and students, and rightly.

---

## Design decisions

### D1 — Fingerprint at judge time, search by index

v1's plan was an O(n²) pairwise comparison at contest end. For a 60-student
section with 5 problems that is 44,000 comparisons of full source text, repeated
per contest, and it cannot search across semesters at all.

Instead, **winnowing** (Schleimer, Wilkerson & Aiken, 2003):

1. **Normalise** — strip comments and string literals, rename all identifiers to
   `V`, normalise whitespace, drop the token stream's noise. The result is
   structure only, so renaming variables and reformatting defeats nothing.
2. **k-gram hash** — rolling hash over every window of `k = 25` normalised
   tokens.
3. **Winnow** — in each window of `w = 40` hashes keep the minimum, breaking ties
   by rightmost. This selects a density-bounded, position-independent subset —
   typically 3–5% of hashes — with a guarantee that any shared substring of
   length ≥ `w + k − 1` is detected.
4. **Store** the selected fingerprints in an inverted index.

Search then becomes: look up a submission's fingerprints, count shared entries
per candidate, rank. That is an index lookup, not a scan — and it works across
every submission ever made, including previous semesters, which is where most
copying actually comes from.

Normalisation is per-language and lives beside the language registry (Phase 3
already stores `commentPrefix` per language for exactly this).

### D2 — Similarity needs a baseline, or it is useless

Two solutions to "read two integers and print the sum" are identical. Naive
similarity flags the entire class on every easy problem.

Two corrections:

- **Length floor**: submissions under ~40 normalised tokens are never compared.
- **Population baseline**: for each problem, compute the *distribution* of
  pairwise similarity across all submissions. Report a pair's similarity as a
  **z-score against that problem's own distribution**, not as a raw percentage.
  A pair at 85% on a problem where the median is 80% is unremarkable; a pair at
  85% where the median is 30% is the whole point.

This single change is the difference between a tool teachers use and one they
turn off after the first false-positive storm.

- **Boilerplate suppression**: fingerprints appearing in more than 20% of a
  problem's submissions (starter code, common includes, a standard fast-IO
  template) are excluded from scoring.

### D3 — Parameterised variants: the strongest control

Rather than detecting copying after the fact, make it not work.

A **variant template** is a problem whose statement and test data are generated
per student from a seed:

```
ProblemVariantTemplate
  ├── statementTemplate   Markdown with {{placeholders}}
  ├── parameterSpec       JSON: how to draw each parameter from the seed
  ├── generatorSource     program: seed → test input files
  └── referenceSource     program: input → expected output
```

At assignment or exam time, each student's seed is
`hash(assignmentId + userId + salt)`. The pipeline generates their statement,
their test inputs, and — by running the reference solution — their expected
outputs. Everything is cached; a student who reloads gets the same variant.

Parameter kinds: integer ranges, choices from a set, random arrays with
constraints, permutations, string alphabets, and derived values (e.g. "N must be
prime", "the answer must be non-trivial").

Copying a neighbour's *code* still works if the logic is general — which is fine
and is the point. Copying their *answer*, their output, or a hardcoded constant
does not. Combined with fingerprinting, a student who copies working general code
is caught by similarity; a student who copies an answer gets `WA`.

Reuse everything: the generator and reference are judged through the Phase 3
engine, in the same sandbox, with the same limits. A variant is just a
`ProblemVersion` generated on demand.

Scope note: this is a substantial sub-project. Ship the fingerprinting and
proctoring first, and treat variants as the second half of the phase — with an
explicitly narrow v1 (integer and array parameters only, batch problems only, no
interactive, no special judges).

### D4 — Proctoring signals are logged, shown, and never scored

`strictMode: true` on a contest enables client-side telemetry:

| Event | Captured | Note |
|---|---|---|
| `blur` / `focus` | timestamp, duration away | The most useful signal |
| `visibilitychange` | tab hidden/shown | Same, more reliable |
| `paste` | length, whether it came from outside the editor | Not the content — never log what was pasted |
| `copy` | length | — |
| `fullscreen-exit` | timestamp | Only if fullscreen was requested |
| `resize` | to a suspiciously small viewport | Weak signal, low weight |
| `devtools-open` | heuristic | Unreliable; log, do not weight |

Never logged: keystrokes, clipboard contents, screen contents, anything from
outside the contest page. Students see a clear banner when strict mode is on,
stating exactly what is recorded. Anything less is surveillance without consent
and will (correctly) be treated as such.

The teacher sees a per-student timeline after the contest. No score, no flag —
a timeline. "Left the tab 14 times for a total of 9 minutes" is information a
teacher can interpret; "integrity score 62" is not.

### D5 — Session binding, not lockdown

In strict mode, a participant's contest session is bound to one `Session` row
(Phase 1). A login from elsewhere either fails or, if forced, ends the first
session with a visible notice. This stops the simplest and most common cheat —
handing your credentials to a stronger friend — with no client-side lockdown
required.

---

## Schema

```prisma
model SubmissionFingerprint {
  submissionId String   @id
  language     String
  /// Winnowed fingerprint hashes, sorted.
  hashes       BigInt[]
  tokenCount   Int
  /// Fast pre-filter before the expensive comparison.
  minhash      BigInt[]
  createdAt    DateTime @default(now())

  submission Submission @relation(fields: [submissionId], references: [id], onDelete: Cascade)
}

/// Inverted index: hash → submissions containing it. Written by the worker.
model FingerprintIndex {
  hash         BigInt
  problemId    String
  submissionId String

  @@id([hash, submissionId])
  @@index([problemId, hash])
}

model SimilarityPair {
  id            String   @id @default(cuid())
  scopeType     String   // "contest" | "section" | "assignment" | "global"
  scopeId       String
  problemId     String
  submissionAId String
  submissionBId String
  userAId       String
  userBId       String
  /// Jaccard similarity over winnowed fingerprints, 0..1.
  similarity    Float
  /// Standard deviations above this problem's population median.
  zScore        Float
  sharedTokens  Int
  /// Aligned regions for the side-by-side view: [{aStart,aEnd,bStart,bEnd}]
  regions       Json     @default("[]")
  status        String   @default("OPEN")   // OPEN | DISMISSED | CONFIRMED | ESCALATED
  reviewedById  String?
  reviewedAt    DateTime?
  reviewNote    String   @default("")
  createdAt     DateTime @default(now())

  @@unique([scopeType, scopeId, submissionAId, submissionBId])
  @@index([scopeType, scopeId, zScore])
  @@index([userAId])
  @@index([userBId])
}

model ProctorEvent {
  id              String   @id @default(cuid())
  contestId       String
  participationId String
  userId          String
  type            String   // blur | focus | hidden | visible | paste | copy | fullscreen-exit | resize
  at              DateTime @default(now())
  /// Bounded metadata only: durations and lengths, never content.
  meta            Json     @default("{}")

  @@index([contestId, userId, at])
  @@index([participationId])
}

model ProblemVariantTemplate {
  id               String  @id @default(cuid())
  problemId        String  @unique
  statementTemplate String
  parameterSpec    Json
  generatorSource  String
  generatorLang    String  @default("cpp20")
  referenceSource  String
  referenceLang    String  @default("cpp20")
  testPlan         Json    @default("{}")   // how many cases, which groups
  createdById      String
  createdAt        DateTime @default(now())

  problem  Problem          @relation(fields: [problemId], references: [id], onDelete: Cascade)
  variants ProblemVariant[]
}

model ProblemVariant {
  id          String   @id @default(cuid())
  templateId  String
  userId      String
  scopeType   String                        // "assignment" | "contest"
  scopeId     String
  seed        String
  parameters  Json
  /// Generated version this student actually solves.
  problemVersionId String @unique
  createdAt   DateTime @default(now())

  template ProblemVariantTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

  @@unique([templateId, userId, scopeId])
  @@index([scopeId])
}

model IntegrityReport {
  id          String   @id @default(cuid())
  scopeType   String
  scopeId     String
  generatedAt DateTime @default(now())
  summary     Json
  createdById String

  @@index([scopeType, scopeId])
}
```

`BigInt[]` for hashes: Postgres has no native uint64, so store as `bigint[]` with
the top bit handled by the hash function producing 63-bit values. Documented in
the fingerprinter so nobody "fixes" it into a collision.

Migration `0019_integrity`: additive. Backfill fingerprints for historical
submissions as a low-priority queued batch — worth doing, because cross-semester
detection is only as good as the history it has.

---

## Modules

```
src/lib/integrity/
  normalize/          # per-language token normalisation (c, cpp, python, java, js)
  winnow.ts           # k-gram hashing + winnowing
  index.ts            # inverted index write + candidate search
  compare.ts          # Jaccard, z-score against the problem population, region alignment
  proctor.ts          # event validation, rate limiting, timeline assembly
  variants/
    spec.ts           # parameterSpec schema + seeded drawing
    generate.ts       # seed → parameters → statement → test data (via the judge)
    cache.ts
```

### Similarity sweep

Triggered on contest end, assignment close, or on demand. For each problem in
scope:

1. Load all submissions' fingerprints (best submission per user, plus any AC).
2. Candidate generation via the inverted index — only pairs sharing ≥ 3
   fingerprints proceed.
3. Exact Jaccard on the candidates.
4. Compute the problem's population median and MAD; convert each pair's
   similarity to a z-score.
5. Persist pairs above `z ≥ 3` **or** `similarity ≥ 0.9`, with aligned regions.

Complexity is `O(candidates)`, not `O(n²)`. On a 60-student section this is
milliseconds.

**Scope expansion**: the same search also runs against submissions outside the
scope — earlier semesters, other sections, the public archive — and reports those
separately as "external match". That is where the most useful hits come from and
it is free once the index exists.

---

## Integrity console

`/teacher/contests/[id]/integrity` and `/teacher/assignments/[id]/integrity`:

- Pairs ranked by z-score, with similarity, shared-token count, and both students.
- Side-by-side diff with aligned regions highlighted — the normalised view by
  default (which is what the score is based on) and a raw-source toggle.
- Timeline overlay: when each student submitted, in what order, with proctor
  events.
- Disposition: Dismiss (with a reason) / Confirm / Escalate to admin. Every action
  audited.
- External matches in a separate tab.
- "Generate integrity report" → a PDF for the department, listing confirmed cases
  with evidence.

Per-student proctor timeline: a horizontal band per participant, focus/blur
marked, paste events marked, total away-time summarised.

**Presentation matters here.** The console must read as evidence for a human
judgement, not a verdict. Labels: "Needs review", not "Cheating detected". Show
the population median next to every score so the teacher can calibrate.

---

## Client-side proctoring

`components/contest/ProctorGuard.tsx`, mounted only when `strictMode` is on:

- A visible banner: *"Exam mode: this contest records when you switch tabs and
  when you paste code. It does not record your screen or what you type."*
- Listens for `visibilitychange`, `blur`/`focus`, `paste`, `copy`,
  `fullscreenchange`.
- Batches events and posts every 15 s (and on `beforeunload` via
  `sendBeacon`), so a lost connection loses at most 15 s of telemetry.
- Optionally requests fullscreen at entry — requested, never enforced; browsers
  cannot enforce it and pretending otherwise creates false confidence.
- Server-side rate limits the event endpoint (200 events/minute/participation)
  so it cannot be used to flood the database.

Events are **advisory**. The absence of events proves nothing (a student can
disable JavaScript); their presence is information.

---

## API contracts

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/api/contests/[id]/proctor` | participant | Batched events |
| `POST` | `/api/teacher/integrity/sweep` | teacher | `{ scopeType, scopeId }` → queued job |
| `GET` | `/api/teacher/integrity/pairs` | teacher | Ranked pairs for a scope |
| `POST` | `/api/teacher/integrity/pairs/[id]/disposition` | teacher | `{ status, note }` |
| `GET` | `/api/teacher/integrity/timeline` | teacher | `?participationId=` |
| `GET` | `/api/teacher/integrity/report.pdf` | teacher | — |
| `POST` | `/api/teacher/variants/templates` | teacher | Create a variant template |
| `POST` | `/api/teacher/variants/preview` | teacher | Generate 5 sample variants to eyeball |
| `GET` | `/api/problems/[id]/variant` | participant | The caller's own variant statement |

---

## Testing plan

| Tier | Test |
|---|---|
| Unit | Normalisation: renaming variables, reformatting, reordering functions, and adding comments all produce identical token streams |
| Unit | Winnowing guarantee: any shared substring ≥ `w+k−1` tokens is detected |
| Unit | Boilerplate suppression removes a template present in >20% of submissions |
| Unit | z-score: identical trivial solutions on an easy problem produce a low z despite a high raw similarity |
| Unit | Variant generation is deterministic per seed and distinct across users |
| Unit | Proctor event validation rejects malformed and over-rate submissions |
| Integration | Two submissions differing only in identifiers and formatting rank first |
| Integration | Two genuinely independent solutions to a hard problem do not appear |
| Integration | Cross-semester match found for a solution copied from a previous term |
| Integration | Session binding: a second login during a strict contest is refused |
| Integration | A variant's expected output matches the reference solution run on that variant's input |
| Perf | Sweep of a 60-student × 5-problem section in ≤ 10 s |

The false-positive test (independent solutions to a hard problem) is as important
as the true-positive one, and is the test most likely to be skipped. Build a
fixture of 20 genuinely independent human solutions to one problem and assert the
sweep flags none of them.

---

## Acceptance criteria

1. Two submissions that differ only in identifier names and whitespace surface at
   the top of the ranking; twenty independent solutions to the same problem
   surface none.
2. A solution copied from a previous semester is found.
3. A sweep of a 60-student section completes in under 10 seconds.
4. The console shows aligned side-by-side evidence and records a disposition with
   a reason, audited.
5. Strict-mode contests show students exactly what is recorded before they start.
6. A teacher sees a per-student focus/paste timeline after the exam.
7. A second login during a strict contest is refused with a clear message.
8. Each student in a variant exam gets different constants; the reference
   solution's output matches their expected output; a neighbour's answer is
   wrong.
9. No proctor event ever contains pasted content, keystrokes, or screen data.

## Rollback

`integrity` off hides the console and stops sweeps and telemetry. Fingerprints
continue to be computed (they are cheap and the index is valuable) unless
`FLAGS_FINGERPRINT=0`.

## Risks

| Risk | Mitigation |
|---|---|
| False accusations damage a student | Never automatic; z-score against the problem's own population; the console is framed as evidence for review; disposition requires a reason |
| Students perceive surveillance | Explicit banner, minimal and documented signals, no content capture, student can see their own recorded events |
| Fingerprint index grows unbounded | ~4% of tokens per submission; partition by problem; prune submissions older than 3 years to cold storage |
| Variant generation is slow or wrong | Generated ahead of time as a batch when the assignment is published, not on demand; teacher previews 5 variants before publishing; a failing generator blocks publication |
| Variants make a problem unintentionally harder for some students | Parameter spec includes explicit difficulty invariants; preview shows the reference solution's runtime across 20 seeds |
| Proctoring gives false confidence | Documented plainly: it detects casual cheating, not determined cheating. Variants are the real control. |

## Definition of done

- [ ] Winnowing fingerprints computed at judge time for all languages
- [ ] Inverted index with candidate search; historical backfill queued
- [ ] Population-baselined z-scores + boilerplate suppression
- [ ] Similarity sweep on contest end, assignment close, and on demand
- [ ] Integrity console with aligned diff, timelines, dispositions, audit
- [ ] Cross-scope (semester/section/archive) external matching
- [ ] Proctor telemetry with a consent banner and content-free events
- [ ] Session binding for strict-mode contests
- [ ] Variant templates: spec, generator, reference, per-student generation, preview
- [ ] Integrity report PDF
- [ ] False-positive fixture suite passing
