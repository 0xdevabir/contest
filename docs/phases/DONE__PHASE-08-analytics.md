# Phase 8 — Analytics & Reporting

> **Execute with**: "execute Phase 8"
> **Effort**: 10–12 days · **Flag**: `analytics`
> **Depends on**: Phase 2, 5, 6 · **Unblocks**: 15 (adaptive practice needs mastery signals)

---

## Goal

Answer, in one screen and without a spreadsheet: *who is falling behind, what is
the class weakest at, and is this student improving?* Plus exports a department
will accept.

## Why now

The data has existed since Phase 6 but is unreadable. A teacher with 60 students
and 12 assignments has 720 cells and no time. Analytics is what converts stored
data into the reason a teacher opens the platform on a Tuesday morning.

## Scope

- `src/lib/analytics/` — cohort, student, problem and tag aggregations
- Class heatmap (student × problem grid of best verdicts)
- Tag mastery: per-student and per-cohort accuracy by topic
- At-risk detection with explainable reasons
- Student deep-dive for teachers
- Time-series: activity, attempts-to-AC, difficulty progression
- Exports: gradebook CSV, class report PDF, per-student report
- Problem-side analytics for setters (discrimination, difficulty calibration)
- Nightly rollup jobs so nothing is computed live at page load

---

## Design decisions

### D1 — Rollups, not live aggregation

Every metric here is a `GROUP BY` over `Submission`, the largest table. Computing
them on page load is how the analytics page becomes the slowest page on the site
and takes the database down with it during a contest.

Nightly (and on-demand for one section) jobs write to rollup tables:

```prisma
model UserTagStat {
  userId    String
  tagId     String
  attempted Int      @default(0)
  solved    Int      @default(0)
  /// solved / attempted, smoothed: (solved + 1) / (attempted + 2)
  mastery   Float    @default(0)
  avgAttemptsToAc Float?
  lastSolvedAt DateTime?
  updatedAt DateTime @updatedAt

  @@id([userId, tagId])
  @@index([tagId, mastery])
}

model SectionStat {
  sectionId       String   @id
  activeStudents  Int      @default(0)
  medianSolved    Float    @default(0)
  /// Tag ids ranked by lowest cohort mastery, with the values.
  weakTags        Json     @default("[]")
  atRiskUserIds   String[] @default([])
  updatedAt       DateTime @updatedAt
}

model UserDailyStat {
  userId    String
  day       DateTime  @db.Date
  submitted Int       @default(0)
  solved    Int       @default(0)
  minutesActive Int   @default(0)

  @@id([userId, day])
  @@index([day])
}
```

`UserDailyStat` also powers the existing `ActivityHeatmap` component, which
currently computes from raw submissions — a straight performance win.

**Laplace-smoothed mastery** `(solved + 1) / (attempted + 2)` rather than raw
accuracy: a student who attempted one DP problem and solved it does not have 100%
DP mastery, and ranking weak topics by raw accuracy surfaces exactly those
one-sample noise cases at the top.

### D2 — At-risk is explainable, never a black box

A teacher will not act on "at risk: 73%". They will act on "hasn't submitted in
9 days and has 0/3 on the last assignment".

Signals, each with a threshold and a human sentence:

| Signal | Threshold | Sentence |
|---|---|---|
| Inactivity | No submission in 7+ days while an assignment is open | "No activity for 9 days" |
| Assignment miss | Scored < 40% on the most recent graded assignment | "Scored 2/10 on Assignment 4" |
| Not started | Assignment due in < 48 h, zero submissions | "Hasn't started Assignment 5 (due tomorrow)" |
| Declining trend | Last 3 assignments each lower than the previous | "Scores declining over 3 assignments" |
| Struggle pattern | Median attempts-to-AC > 2× the cohort median | "Needs 8 attempts where the class needs 3" |
| Never solved | Enrolled 14+ days, zero AC | "Has never solved a problem here" |

A student is at risk if **any two** fire. The UI lists the firing signals, not a
score. Rank by count of signals, then by recency.

### D3 — The heatmap is the anchor screen

Rows = students, columns = problems (grouped by assignment), cells = best verdict
colour-coded. It answers the three most common teacher questions at a glance:
which problem broke the class (a vertical stripe), which student is stuck (a
horizontal stripe), and who has not started (an empty row).

At 60 × 40 this is 2400 cells. Render as a CSS grid of divs — not a table, not
SVG, not canvas — with `content-visibility: auto` on row groups. Cell click opens
that student's submissions for that problem in a side panel.

### D4 — Problem analytics for setters

Distinct from student analytics and genuinely useful:

- **Difficulty**: AC rate, median attempts-to-AC, median time-to-AC.
- **Discrimination**: correlation between solving this problem and overall
  performance. A problem that strong students fail and weak students pass is
  broken — usually an ambiguous statement or a bad test.
- **Verdict distribution**: a `TLE` mountain means the limit is too tight or the
  intended complexity is unclear; a `CE` mountain in one language means the
  starter code is broken.
- **First-AC language distribution**: a problem nobody solves in Python usually
  has a limit that ignores `timeFactor`.

These feed back into Phase 2's authoring loop and Phase 15's difficulty model.

---

## Modules

```
src/lib/analytics/
  rollup.ts        # nightly jobs; incremental by watermark
  cohort.ts        # section-level: heatmap, weak tags, distribution, at-risk
  student.ts       # per-student: mastery radar, timeline, attempts distribution
  problem.ts       # setter analytics: difficulty, discrimination, verdict mix
  export.ts        # CSV + PDF generation
  signals.ts       # at-risk signal definitions (pure, testable)
```

`signals.ts` is pure and takes a plain data bundle, so the whole at-risk logic is
unit-tested with fixtures rather than requiring a seeded database.

**Incremental rollups**: each job stores a watermark (`lastProcessedSubmissionId`
or `lastRunAt`) and processes only newer rows. A full recompute is a separate,
explicitly-invoked path used after a rejudge.

---

## Exports

| Export | Format | Notes |
|---|---|---|
| Gradebook | CSV | UTF-8 **with BOM** (Excel + Bangla names), one row per student, one column per gradebook column, plus computed total and letter grade |
| Class report | PDF | Cover (course, section, semester, teacher), cohort summary, weak-topic chart, per-student one-line table, generated server-side |
| Student report | PDF | For a parent meeting or an advising session: activity timeline, mastery by topic, assignment history |
| Raw submissions | CSV | For a teacher's own analysis; scoped to their sections |
| Contest standings | CSV | From the Phase 5 snapshot |

PDF generation: server-side HTML → PDF. Do **not** add Puppeteer/Chromium (250 MB
and unusable on Vercel). Use `@react-pdf/renderer` — it renders React to PDF with
no browser, works in a serverless function, and handles the Bangla font if the
font file is embedded. Embedding a Bangla-capable font (Noto Sans Bengali) is
required; without it, Bangla names render as boxes, which is worse than useless.

---

## API contracts

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/teacher/sections/[id]/analytics` | teacher/TA | Summary + weak tags + at-risk |
| `GET` | `/api/teacher/sections/[id]/heatmap` | teacher/TA | Grid payload, `?assignmentId=` to scope |
| `GET` | `/api/teacher/sections/[id]/students/[uid]` | teacher/TA | Deep dive |
| `GET` | `/api/teacher/sections/[id]/report.pdf` | teacher | Class report |
| `GET` | `/api/teacher/sections/[id]/students/[uid]/report.pdf` | teacher | Student report |
| `GET` | `/api/teacher/problems/[id]/analytics` | author/admin | Setter analytics |
| `GET` | `/api/me/analytics` | session | The student's own view of the same data |
| `POST` | `/api/admin/analytics/rollup` | admin | Force a rollup (scope optional) |

**Every teacher analytics route is scoped to sections the caller teaches or TAs.**
Enforced in `authz.ts`, tested explicitly — a teacher reading another teacher's
class data is a privacy incident, and the natural implementation (query by
`sectionId` from the URL) has exactly that bug unless the check is deliberate.

---

## Frontend surfaces

| Route | Content |
|---|---|
| `/teacher/sections/[id]/analytics` | Header stats (active, median solved, submissions this week); at-risk list with signal chips; weak-topic bar chart; heatmap |
| `/teacher/sections/[id]/students/[uid]` | Timeline, tag-mastery radar, assignment history, attempts distribution vs class median, recent submissions |
| `/teacher/problems/[id]/analytics` | Setter view |
| `/profile/insights` *(new)* | The student's own mastery, weakest topics, streak, and — from Phase 15 — recommended next problems |
| `components/analytics/Heatmap.tsx` | The grid |
| `components/analytics/MasteryRadar.tsx` | Tag mastery |
| `components/analytics/SignalChips.tsx` | At-risk reasons |

Charts: follow the `dataviz` guidance — colour-blind-safe categorical palette,
readable in both themes, no chart without an axis label. Prefer inline SVG over a
charting library for these four chart types; they are simple enough that a
dependency costs more than it saves.

Giving students their own `/profile/insights` view of the same data is
deliberate: it turns surveillance into feedback, and it is the surface Phase 15's
recommendations attach to.

---

## Testing plan

| Tier | Test |
|---|---|
| Unit | Mastery smoothing: 1/1 does not outrank 18/20 |
| Unit | Each at-risk signal at its threshold boundary; a student with one signal is not flagged, two are |
| Unit | Heatmap payload shape with missing submissions, multiple attempts, and a rejudged verdict |
| Unit | Incremental rollup watermark: processing twice does not double-count |
| Integration | Teacher A gets 403 on Teacher B's section analytics |
| Integration | TA can read analytics for their own section only |
| Integration | CSV export opens in Excel with Bangla names intact (assert the BOM and encoding) |
| Integration | PDF export renders Bangla glyphs (assert embedded font, non-empty text layer) |
| Perf | 60 × 40 heatmap in ≤ 500 ms p95; analytics summary ≤ 300 ms (rollups pre-computed) |

---

## Acceptance criteria

1. A teacher opens the analytics page for a 60-student section and identifies,
   without scrolling, who has not started the assignment due tomorrow and which
   topic the class is weakest at.
2. Every at-risk student shows the specific reasons they were flagged.
3. The heatmap makes a broken problem visible as a vertical stripe.
4. Clicking a cell opens that student's submissions for that problem.
5. Gradebook CSV opens in Excel with Bangla names correct.
6. The class report PDF renders Bangla and is presentable to a department head.
7. A setter can see that problem 4 has a 6% AC rate and a `TLE` mountain, and act.
8. Analytics pages load in under 500 ms because everything is pre-rolled.
9. A teacher cannot read another teacher's section data.

## Rollback

`analytics` off hides the routes. Rollup tables are additive; the nightly job can
be disabled independently.

## Risks

| Risk | Mitigation |
|---|---|
| Rollups drift from the truth after a rejudge | Rejudge enqueues a scoped recompute; a nightly full recompute per active section as a backstop |
| At-risk flags feel accusatory or become a punishment tool | Framed as "needs attention" with explicit reasons; visible to the student in their own insights; documented as a teaching aid |
| Analytics queries lock the submissions table | Rollups run off-peak on a read replica once one exists (Phase 13); until then, batched with statement timeouts |
| PDF generation times out in a serverless function | `@react-pdf/renderer` (no browser); large exports queued via BullMQ and delivered by email link |
| Bangla renders as boxes | Embedded Noto Sans Bengali; a rendering test asserting non-empty glyph output |

## Definition of done

- [ ] `UserTagStat`, `SectionStat`, `UserDailyStat` with incremental nightly rollups
- [ ] Class analytics: summary, weak topics, at-risk with explainable signals
- [ ] Student × problem heatmap with cell drill-down
- [ ] Teacher student deep-dive
- [ ] Setter problem analytics including discrimination
- [ ] Student-facing `/profile/insights`
- [ ] CSV (BOM) + PDF (Bangla-capable) exports
- [ ] Section-scoping enforced and tested
- [ ] All analytics pages under the 500 ms budget
