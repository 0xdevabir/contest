# Phase 15 — Intelligence Layer

> **Execute with**: "execute Phase 15"
> **Effort**: 12–16 days · **Flag**: `ai`
> **Depends on**: Phase 2, 8, 9, 10 · **Unblocks**: authoring throughput, personalised practice

---

## Goal

Remove the two biggest costs in running the platform — **authoring content** and
**individual attention** — with AI assistance that is always human-reviewed,
never authoritative, and never a substitute for the judge.

Five features:

1. **Test-data generation** from a reference solution
2. **Editorial drafting** for a problem the author already solved
3. **Variant parameterisation** for Phase 10 exam variants
4. **Adaptive practice ladder** — the next problem for this student
5. **Hint bot** — explains *why* a submission is wrong without giving the answer

## Why now, and why last

Everything here depends on structured data that earlier phases produce: problems
with reference solutions and test groups (Phase 2), per-tag mastery signals
(Phase 8), problem Elo (Phase 9), and the variant infrastructure (Phase 10).
Built earlier, each of these is a demo. Built now, each is a feature.

## The rule that governs this entire phase

> **AI drafts. Humans approve. The judge decides.**

No AI output is ever published, graded, or shown as authoritative without a human
in the loop. Generated test data is validated by running the reference solution.
Generated editorials are drafts a teacher edits and publishes. Hints never
contain a solution. This is not caution for its own sake — an incorrect test case
or a wrong hint costs more trust than the feature earns.

---

## Design decisions

### D1 — The API surface

TypeScript, official SDK (`@anthropic-ai/sdk`), server-side only.

- **Model**: `claude-opus-5` for every feature in this phase. All five are
  correctness-sensitive (test data that must be right, hints that must not leak
  answers, editorials a teacher will publish under their own name).
- **Thinking**: `thinking: { type: "adaptive" }` on everything. Generation and
  hint-writing both benefit from reasoning; adaptive lets the model decide depth
  per request.
- **Effort**: `output_config: { effort: "high" }` for generation and editorials
  (correctness-critical, low volume); `"medium"` for the recommendation
  explanation and hints (high volume, simpler task). Tune per route with
  measurement, not by guess.
- **Structured outputs**: `output_config: { format: ... }` with a JSON schema for
  everything machine-consumed (parameter specs, test plans, recommendation
  rationales). Never parse free text into a data structure.
- **Streaming** for anything user-facing (hints, editorial drafts) so the teacher
  or student sees progress rather than a spinner.

```ts
// src/lib/ai/client.ts
import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic();          // reads ANTHROPIC_API_KEY
export const MODEL = "claude-opus-5" as const;
```

### D2 — Cost control is caching plus batching, not a cheaper model

Two free levers before any quality tradeoff:

- **Prompt caching.** Every request in this phase shares a large stable prefix —
  the problem statement, the reference solution, the platform's authoring
  conventions. Put the stable part first with
  `cache_control: { type: "ephemeral" }` and the volatile part (the specific
  question, the student's code) after it. Cache reads are ~10% of input cost.
  Verify with `usage.cache_read_input_tokens`; if it is zero across repeated
  calls, something in the prefix is varying — a timestamp, an unsorted object.
- **Batch API** for anything not interactive: bulk editorial drafting across 200
  problems, nightly recommendation precomputation, variant pre-generation for a
  200-student exam. `client.messages.batches.create()` runs asynchronously at 50%
  cost. Results arrive in **any order** — key by `custom_id`, never by position.

Budget: a per-institution monthly token cap, enforced before the call, surfaced
in `/admin/costs` (Phase 13). A runaway loop must hit a wall, not a bill.

### D3 — Test-data generation is generate-then-verify, never generate-and-trust

The pipeline is not "ask for test cases". It is:

```
1. Input: statement + reference solution (+ constraints)
2. AI produces a GENERATOR PROGRAM (C++), not test data:
   a seeded program that emits one valid input per seed.
   Plus a rationale listing the edge cases it targets.
3. Compile and run the generator in the Phase 3 sandbox → N inputs
4. Run the teacher's reference solution on each input → expected outputs
5. Validate: run an AI-produced VALIDATOR program asserting each input
   satisfies the stated constraints
6. Diversity check: reject a set where >70% of inputs share a shape
7. Present to the teacher: inputs, outputs, the rationale, coverage summary
8. Teacher accepts, edits, or regenerates
```

Generating a *generator* rather than data is the key move. It gives 500 test
cases from one call, makes edge-case reasoning inspectable, and the expected
output always comes from the teacher's own reference solution — so a model
hallucination cannot produce a wrong expected answer. The worst failure mode is a
useless test, never an incorrect one.

Edge cases to prompt for explicitly: minimum and maximum constraint values,
empty/single-element inputs, all-identical values, sorted and reverse-sorted,
overflow boundaries, and adversarial cases for the intended complexity (a case
that makes an O(n²) solution TLE while the intended O(n log n) passes).

### D4 — The recommender is a scoring function; AI only explains it

The "next problem" decision is **not** an LLM call. It is a deterministic score
over data that already exists:

```
score(problem, student) =
    w₁ · difficultyFit(problemElo, studentRating)      // ~+100 above their rating
  + w₂ · tagNeed(problemTags, studentTagMastery)       // weakest tags first
  + w₃ · freshness(lastSeen, attempted)                // not recently failed
  + w₄ · curriculumFit(sectionTags)                    // what their course covers
  − w₅ · repetition(sameTagStreak)                     // vary the topic
```

Deterministic, explainable, testable, free, and instant. The LLM writes the
one-sentence *reason* shown to the student ("You've solved 8 easy DP problems;
this one adds a second dimension"), precomputed nightly in a batch job — not on
page load.

Building the recommendation itself as an LLM call would be slower, more
expensive, non-deterministic, and no better. Use the model where language is the
output, not where arithmetic is.

### D5 — The hint bot must not solve the problem

The hardest prompt-engineering problem in this phase. The bot sees: the
statement, the student's code, the failing test's **input only** (never the
expected output), and the verdict. It must produce a hint at one of three
escalating levels, and the student chooses the level:

| Level | Allowed | Forbidden |
|---|---|---|
| 1 — Nudge | Name the *category* of the issue ("your loop bound looks off by one") | Line numbers, corrected code, the algorithm |
| 2 — Direction | Point at the region and the concept ("the condition on line 14 fails when the array has one element") | Corrected code, a full algorithm sketch |
| 3 — Explain | Explain the bug and the correct approach in prose | Any code the student could paste |

Enforcement is layered, because prompting alone is insufficient:

1. System prompt with explicit level rules and refusal instructions.
2. **Structured output** with a `level` field the model must self-declare; a
   mismatch with the requested level is rejected server-side.
3. A **post-filter**: reject any response containing a code block, or more than
   N consecutive tokens matching the reference solution.
4. Rate limit: 3 hints per problem per student, and **disabled entirely during
   any live contest or open graded assignment** — checked server-side against the
   same Redis live-contest set Phase 11 uses for editorial gating.

Point 4 is the one that matters most. A hint bot available during a graded lab
exam is a cheating tool, however well it is prompted.

### D6 — Translation drafts, never translation publishing

Phase 14 established that statements are bilingual content, and a mistranslated
constraint produces wrong answers. AI may **draft** a Bangla statement; a human
must approve it before it is visible. `ProblemVersion.bnApprovedById` (Phase 14)
already exists for exactly this.

---

## Architecture

```
src/lib/ai/
  client.ts          # SDK client, model constant, shared request helpers
  budget.ts          # per-institution token budget, pre-call enforcement
  cache.ts           # response cache keyed by (feature, inputHash)
  prompts/
    testgen.ts  editorial.ts  variant.ts  hint.ts  translate.ts  recommend.ts
  features/
    testgen.ts       # generate → compile → run → validate → diversity check
    editorial.ts     # draft from statement + reference + AC submissions
    variant.ts       # parameter spec + generator + reference for Phase 10
    hint.ts          # level-gated, filtered, streamed
    translate.ts     # Bangla draft
  recommend/
    score.ts         # deterministic scoring (pure, no AI)
    explain.ts       # batched one-line rationales
  guardrails.ts      # output filters, leak detection, level enforcement
```

Every feature: schema-validated input → budget check → cached? → API call →
schema-validated output → guardrails → persisted as a **draft** → human review.

**Response caching** is worth it here: the same problem's editorial draft
requested twice should not cost twice. Key on a hash of the exact input payload;
store in Redis with a 30-day TTL.

---

## Schema

```prisma
enum AiJobKind   { TESTGEN EDITORIAL VARIANT HINT TRANSLATE RECOMMEND }
enum AiJobStatus { PENDING RUNNING SUCCEEDED FAILED REJECTED }

model AiJob {
  id            String      @id @default(cuid())
  kind          AiJobKind
  status        AiJobStatus @default(PENDING)
  requestedById String
  institutionId String?
  /// Hash of the input payload — the response cache key.
  inputHash     String
  input         Json
  output        Json?
  error         String?
  model         String
  inputTokens   Int         @default(0)
  outputTokens  Int         @default(0)
  cachedTokens  Int         @default(0)
  costCents     Float       @default(0)
  /// Non-null once a human accepted or rejected the draft.
  reviewedById  String?
  reviewedAt    DateTime?
  accepted      Boolean?
  createdAt     DateTime    @default(now())
  finishedAt    DateTime?

  @@index([kind, status, createdAt])
  @@index([inputHash])
  @@index([institutionId, createdAt])
}

model AiBudget {
  institutionId String   @id
  monthlyCents  Float    @default(2000)
  usedCents     Float    @default(0)
  periodStart   DateTime
  hardStop      Boolean  @default(true)
}

model ProblemRecommendation {
  userId      String
  problemId   String
  score       Float
  reason      String   @default("")
  computedAt  DateTime @default(now())

  @@id([userId, problemId])
  @@index([userId, score])
}

model HintRequest {
  id           String   @id @default(cuid())
  userId       String
  problemId    String
  submissionId String?
  level        Int
  hint         String
  helpful      Boolean?
  createdAt    DateTime @default(now())

  @@index([userId, problemId])
}
```

Migration `0023_ai`: additive.

---

## Feature detail

### 1. Test-data generation

Entry: the Phase 2 problem editor, "Generate test cases" beside the manual table.

Input: statement, constraints, reference solution, existing test count, target
count, and the test groups to fill. Output: a generator program, a validator
program, a rationale, and a proposed group assignment.

The teacher sees a preview table of the generated inputs with expected outputs
(from *their* reference solution), a coverage summary ("covers n=1, n=max,
all-equal, sorted, adversarial-for-O(n²)"), and per-case accept/reject. Accepted
cases go through the normal Phase 2 test-data path — same validation, same blob
storage, same publish gate.

**Time saved**: authoring 20 good test cases by hand is 45–90 minutes. This makes
it 5 minutes of review. That is the difference between a teacher writing one
original problem per semester and ten.

### 2. Editorial drafting

Input: statement, reference solution(s), the distribution of failing verdicts
(from Phase 8 problem analytics — "62% of failures are TLE" is a strong signal
about what the editorial must explain), and 2–3 accepted student solutions in
different languages.

Output: a structured draft — approach, key insight, complexity, common pitfalls,
annotated reference implementation.

Always a draft: created as `Editorial{ published: false }` with a visible "AI
draft — review before publishing" banner in the editor. Bulk drafting across a
whole problem set goes through the Batch API overnight.

### 3. Variant parameterisation

Input: a problem and its reference solution. Output: a `parameterSpec` (which
constants to vary and over what ranges), a rewritten statement with
`{{placeholders}}`, and a generator that takes the drawn parameters.

Verification before a teacher may use it: generate 20 variants, run the reference
solution on each, and assert that all 20 produce valid non-degenerate outputs and
that runtimes stay within 2× of each other. A variant set where one student's
instance is twice as hard is worse than no variants at all.

### 4. Adaptive practice ladder

Nightly job: score every candidate problem for every active user, keep the top
20, and batch-generate one-line rationales. Surfaced on `/profile/insights`
(Phase 8) as "Recommended for you", and on the section page as "practice for this
week's topic" scoped to the course's tags.

Weights are configurable and A/B-testable. Measure: do students who follow
recommendations solve more over the following two weeks than a control group?
Ship the measurement with the feature or the weights will never be tuned.

### 5. Hint bot

Entry: the submission result panel, after a failed attempt, as
"Stuck? Get a hint" with three level buttons and an explanation of what each
gives. Streamed. Rate-limited. Disabled during contests and open graded
assignments. Logged with an optional "was this helpful" — which is both a quality
signal and the training data for improving the prompt.

Teachers see hint usage per student in Phase 8 analytics (count and level only,
never content) as a signal of who is struggling.

---

## API contracts

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/api/ai/testgen` | teacher, owns the problem | Returns an `AiJob` id; result polled or streamed |
| `POST` | `/api/ai/testgen/[jobId]/accept` | owner | Commits selected cases through the Phase 2 path |
| `POST` | `/api/ai/editorial` | teacher, owns the problem | Creates an unpublished draft |
| `POST` | `/api/ai/variant` | teacher | Creates a `ProblemVariantTemplate` draft + verification report |
| `POST` | `/api/ai/hint` | student | `{ submissionId, level }`; 403 during a contest or open assignment |
| `POST` | `/api/ai/translate` | teacher | Bangla draft, unapproved |
| `GET` | `/api/me/recommendations` | student | Precomputed |
| `GET` | `/api/admin/ai/usage` | admin | Per-institution spend, job history, acceptance rate |

---

## Testing plan

| Tier | Test |
|---|---|
| Unit | Recommendation scoring: difficulty fit peaks ~+100 Elo; weak tags rank first; a recently-failed problem is suppressed; no tag repeats 3× |
| Unit | Guardrails: a response containing a code block is rejected at levels 1–2; a response matching >N tokens of the reference is rejected at every level |
| Unit | Budget enforcement blocks the call before it is made when the cap is reached |
| Unit | Response cache hits on an identical input hash |
| Integration | Test generation → compile → run reference → validate → diversity check, with a deliberately broken generator failing cleanly |
| Integration | Hints are refused during a live contest and during an open graded assignment |
| Integration | Every AI output persists as a draft; nothing is published without a review record |
| Integration | Variant verification rejects a spec where runtimes vary more than 2× |
| Eval | A fixed set of 25 problems: generated tests must catch a known-wrong solution ≥ 90% of the time |
| Eval | 30 hint scenarios rated by a human for leakage; zero level-1 hints may contain a solution |
| Cost | `cache_read_input_tokens` is non-zero on the second call with the same prefix |

The two eval suites are the real acceptance gates. Write them **before** the
prompts — prompts tuned against a held-out eval improve; prompts tuned against
vibes drift.

---

## Acceptance criteria

1. A teacher generates 20 test cases for their problem in under 5 minutes, and
   every expected output comes from their own reference solution.
2. Generated tests catch a known-incorrect solution in ≥ 90% of the eval set.
3. An editorial draft is produced for an existing problem and is publishable
   after light editing — never auto-published.
4. Variant templates are verified across 20 seeds before a teacher may use them.
5. Recommendations are precomputed, explained in one line, and measurably improve
   two-week solve rates against a control group.
6. Level-1 hints never contain code; hints are unavailable during contests and
   open graded assignments; zero leakage in the 30-scenario eval.
7. Every AI output is a draft with a review record; no path publishes without a
   human.
8. Per-institution budgets are enforced before the call, and `/admin/costs`
   reports AI spend alongside infrastructure spend.
9. Prompt caching is verified working — `cache_read_input_tokens` non-zero on
   repeat calls with a shared prefix.

## Rollback

`ai` off hides every entry point and stops the nightly jobs. All AI output lives
in draft state, so nothing published depends on the feature remaining on.

## Risks

| Risk | Mitigation |
|---|---|
| Generated test data is wrong | Expected output always comes from the teacher's reference solution; the model only produces the *generator*. A hallucination yields a useless test, never a wrong one. |
| Hint bot leaks solutions | Three enforcement layers (prompt, structured self-declared level, post-filter), a 30-scenario leakage eval, and hard disabling during graded work |
| Cost runs away | Per-institution hard caps checked pre-call, prompt caching, batch API for bulk work, response cache |
| Teachers over-trust AI editorials | Persistent "AI draft" banner until edited and published; authorship recorded as the teacher's, with the assist logged |
| Students use hints instead of thinking | Escalating levels with the cheapest first, 3-per-problem limit, usage visible to teachers, unavailable when it would be cheating |
| Bangla translations are subtly wrong | Draft only; `bnApprovedById` required before visibility; constraints and numbers diffed against the English source before approval |
| API outage breaks core flows | Every feature is additive and optional; failures degrade to the manual path with a clear message |
| Model or API changes break integration | Pin the model id; schema-validate every response; contract tests in CI |

## Definition of done

- [ ] `src/lib/ai/` with client, budget enforcement, response cache, guardrails
- [ ] Test generation: generator + validator + diversity check + teacher review
- [ ] Editorial drafting, single and bulk via the Batch API
- [ ] Variant parameterisation with 20-seed verification
- [ ] Deterministic recommender + batched rationales + nightly precompute
- [ ] Hint bot: 3 levels, 3 enforcement layers, contest/assignment lockout
- [ ] Bangla translation drafts requiring human approval
- [ ] Prompt caching verified; Batch API used for all bulk work
- [ ] Both eval suites (test-generation efficacy, hint leakage) green in CI
- [ ] Per-institution budgets enforced; AI spend visible in `/admin/costs`
- [ ] Every output is a draft with a review record
