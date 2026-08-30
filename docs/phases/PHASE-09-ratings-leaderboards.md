# Phase 9 — Ratings, National Leaderboards & Gamification

> **Execute with**: "execute Phase 9"
> **Effort**: 10–14 days · **Flag**: `ratings`
> **Depends on**: Phase 1, 5 · **Unblocks**: 15 (adaptive difficulty needs problem Elo)

---

## Goal

The engagement and network-effect layer: a real rating system, verified national
and per-institution leaderboards, competitive seasons, badges, streaks, and
shareable certificates.

## Why now

Institutions are verified (Phase 1) and contests produce immutable standings
snapshots (Phase 5) — the two prerequisites for a leaderboard anyone will trust.
This is also the phase that makes the platform interesting to students who are
not in a course, which is how it grows beyond the departments that adopt it.

## Scope

- Elo-MMR rating (Codeforces-family) computed from standings snapshots
- Rating history, tiers, colours, profile graph
- National leaderboard (verified users only) + per-institution + per-department
- Institution leaderboard (universities ranked against each other)
- Seasons with resets and archived final tables
- Badges, streaks, and a solve calendar
- Verifiable certificates with a public verification page
- Problem Elo (difficulty inferred from solve data) — input to Phase 15

---

## Design decisions

### D1 — Elo-MMR, not plain Elo

Plain Elo is pairwise; a contest is an n-way ranking. Codeforces' system and its
modern successor **Elo-MMR** (Aram Ebtekar & Paul Liu, 2021) handle n-way
outcomes with a rating *and* a volatility term, so a new competitor's rating
converges in 3–5 contests instead of 20.

Implementation sketch (`src/lib/rating/elo-mmr.ts`):

- Each player has `(μ, σ)` — skill estimate and uncertainty.
- Before a contest, inflate σ by a per-contest drift term (skill changes over
  time).
- Compute a performance estimate from the actual rank against the field via the
  logistic model.
- Bayesian update of `(μ, σ)` toward the performance, weighted by σ.
- Display rating = `μ − 2σ` clamped to a floor, so a provisional rating is
  conservative and cannot be gamed by one lucky contest.

Rejected: rolling our own. Rejected: Glicko-2 (designed for pairwise, awkward for
n-way). The Elo-MMR paper's reference implementation is ~200 lines and is the
right amount of complexity here.

**Determinism is required.** Ratings must be recomputable from scratch and
produce identical results — a bug found six months in means replaying the whole
history. Therefore: fixed-point or carefully ordered floating-point arithmetic,
contests processed in `endsAt` order with ties broken by contest id, and a
`ratingEngineVersion` on every event so a change is visible.

### D2 — Tiers are named for this audience

Codeforces' colours are a de facto standard among competitive programmers, and
inventing new names loses the shared vocabulary. Keep the structure, adapt the
labels lightly:

| Rating | Tier | Colour |
|---|---|---|
| < 1200 | Newbie | grey |
| 1200–1399 | Pupil | green |
| 1400–1599 | Specialist | cyan |
| 1600–1899 | Expert | blue |
| 1900–2099 | Candidate Master | violet |
| 2100–2299 | Master | orange |
| 2300–2399 | International Master | orange |
| 2400+ | Grandmaster | red |

Tier colours must pass contrast checks in both themes — cyan on white and grey on
black both fail naively, so define per-theme token pairs rather than raw hexes.

### D3 — Three leaderboards, one query shape

| Board | Scope | Ranked by | Eligibility |
|---|---|---|---|
| **National** | All of Bangladesh | Rating, or solved count | `institutionVerifiedAt != null` |
| **Institution** | One institution | Same | Members of that institution |
| **Institution vs institution** | Universities | Aggregate of top-N members | Verified institutions with ≥ 10 verified members |

The third is the network-effect lever: a university that appears 14th sends
someone to find out why. Aggregate as **the sum of the top 10 members' ratings**
rather than the mean of all members, so a large university cannot be dragged down
by inactive accounts and a small one cannot win on a single strong student.

Filters shared across all three: time range (all-time / season / 30 days),
metric (rating / solved / contests), department, and year of study.

The existing `getPracticeLeaderboard` already implements range/sort/university
filtering well — extend it rather than replacing it.

### D4 — Seasons

A season is a named window (typically one semester). At its end:

- Final tables are snapshotted per board.
- Season badges are awarded (top 1/3/10, most improved, most active).
- Ratings **do not reset** — resetting destroys the signal the rating exists to
  carry. Instead, `SeasonStanding` records where each user finished, and the
  leaderboard offers a "this season" view alongside all-time.

"Most improved" is the important one: it gives a Newbie something to win, which
is where retention actually lives.

### D5 — Problem Elo

Treat each `(user, problem)` first attempt as a match between the user's rating
and the problem's rating:

- Solved on first submission → the problem loses rating to the user's.
- Failed repeatedly → the problem gains.

Run as a batch over historical solve data, iterating to convergence, then
incrementally. Seed each problem at its author's declared difficulty mapped to a
rating band. The result is a data-derived difficulty that is far more useful than
"MEDIUM-HARD" and is the input to Phase 15's recommendations.

Display both: "Author: Medium · Community: 1450".

### D6 — Certificates are signed and verifiable

A certificate is a row plus a public verification page — not a PDF someone can
edit in Photoshop.

- `Certificate { id, type, userId, contestId?, sectionId?, issuedAt, payload, signature }`
- `signature` = HMAC over the canonical payload with a server secret.
- The PDF carries a QR to `/verify/[certificateId]`, which renders the original
  data and a "Verified" badge.
- Types: contest participation, contest rank (top 3 / top 10%), course completion,
  season achievement, problem milestones (100/500/1000 solved).

Cheap to build, and a student putting a verifiable certificate on LinkedIn is
free distribution.

---

## Schema

```prisma
model UserRating {
  userId       String   @id
  /// Internal Elo-MMR state.
  mu           Float    @default(1500)
  sigma        Float    @default(350)
  /// Displayed rating = round(mu - 2*sigma), floored.
  displayed    Int      @default(800)
  peak         Int      @default(800)
  contests     Int      @default(0)
  lastContestAt DateTime?
  engineVersion Int     @default(1)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([displayed])
}

model RatingEvent {
  id          String   @id @default(cuid())
  userId      String
  contestId   String
  snapshotId  String                       // the standings this was computed from
  rank        Int
  ratedCount  Int                          // field size
  muBefore    Float
  sigmaBefore Float
  muAfter     Float
  sigmaAfter  Float
  displayedBefore Int
  displayedAfter  Int
  delta       Int
  engineVersion Int    @default(1)
  createdAt   DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, contestId])
  @@index([contestId])
  @@index([userId, createdAt])
}

model Season {
  id            String   @id @default(cuid())
  slug          String   @unique
  name          String                      // "Fall 2026"
  startsAt      DateTime
  endsAt        DateTime
  institutionId String?                     // null = national
  closedAt      DateTime?

  standings SeasonStanding[]
}

model SeasonStanding {
  id        String @id @default(cuid())
  seasonId  String
  userId    String
  rank      Int
  rating    Int
  ratingGain Int
  solved    Int
  contests  Int

  season Season @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  @@unique([seasonId, userId])
  @@index([seasonId, rank])
}

model Badge {
  id          String  @id @default(cuid())
  code        String  @unique               // "first-ac", "streak-30", "cf-expert"
  name        String
  nameBn      String?
  description String
  icon        String                        // lucide icon name or an emoji
  tier        String  @default("bronze")    // bronze | silver | gold | special
  /// Declarative award rule, evaluated by the badge engine.
  rule        Json
  hidden      Boolean @default(false)       // surprise badges
}

model UserBadge {
  userId   String
  badgeId  String
  earnedAt DateTime @default(now())
  /// Context: which contest/problem earned it.
  context  Json     @default("{}")

  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)
  badge Badge @relation(fields: [badgeId], references: [id], onDelete: Cascade)
  @@id([userId, badgeId])
  @@index([badgeId])
}

model UserStreak {
  userId       String   @id
  current      Int      @default(0)
  longest      Int      @default(0)
  lastSolveDay DateTime? @db.Date
  /// Freezes let a streak survive one missed day; earned weekly, max 2.
  freezes      Int      @default(0)
}

model ProblemRating {
  problemId    String   @id
  rating       Int      @default(1500)
  confidence   Float    @default(0)         // 0..1, grows with solve count
  solvedCount  Int      @default(0)
  updatedAt    DateTime @updatedAt

  problem Problem @relation(fields: [problemId], references: [id], onDelete: Cascade)
  @@index([rating])
}

model Certificate {
  id          String   @id @default(cuid())
  type        String
  userId      String
  contestId   String?
  sectionId   String?
  payload     Json
  signature   String
  issuedAt    DateTime @default(now())
  revokedAt   DateTime?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, type])
}
```

Migration `0018_ratings`: additive. Backfill: compute ratings over all historical
rated contests in `endsAt` order (a one-shot script that is also the recompute
path).

---

## Badge engine

Declarative rules so adding a badge is a database row:

```jsonc
{ "type": "solve_count",   "threshold": 100 }
{ "type": "streak",        "days": 30 }
{ "type": "contest_rank",  "max": 3, "minField": 20 }
{ "type": "rating_tier",   "tier": "expert" }
{ "type": "tag_mastery",   "tagSlug": "dynamic-programming", "solved": 25 }
{ "type": "first_ac_of_problem" }
{ "type": "night_owl",     "hourRange": [2, 5], "count": 10 }
{ "type": "comeback",      "description": "AC after 5+ failed attempts", "attempts": 5 }
```

Evaluated on three triggers: submission judged (cheap rules), contest ended
(rank rules), nightly (streak and aggregate rules). Awarding is idempotent —
`UserBadge` has a composite primary key, so a duplicate award is a no-op insert.

Seed ~30 badges. Include a few hidden ones; discovering an unexpected badge is
disproportionately delightful and costs nothing.

**Streak freezes**: a student who solves daily for 40 days and misses one because
of a family emergency should not lose the streak. One freeze earned per 7-day
streak, maximum 2 held. This single mechanic materially improves streak
retention and is the reason Duolingo's works.

---

## API contracts

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/leaderboard` | public | `?scope=national\|institution\|department&institutionId=&metric=&range=&cursor=` |
| `GET` | `/api/leaderboard/institutions` | public | University vs university |
| `GET` | `/api/seasons/[slug]/standings` | public | Archived season table |
| `GET` | `/api/users/[id]/rating` | public | Current + history for the graph |
| `GET` | `/api/users/[id]/badges` | public | Respects `profilePublic` |
| `GET` | `/api/certificates/[id]` | public | Verification payload |
| `GET` | `/api/certificates/[id].pdf` | public | Rendered certificate |
| `POST` | `/api/admin/ratings/recompute` | admin | Full replay from snapshots |
| `POST` | `/api/admin/seasons/[id]/close` | admin | Snapshot + award season badges |

---

## Frontend surfaces

| Route | Work |
|---|---|
| `/leaderboard` | Rebuilt: three scopes, metric and range filters, tier colours, verified badge, the viewer's own row pinned, cursor pagination |
| `/leaderboard/institutions` *(new)* | University table with member counts and top-10 aggregate |
| `/u/[id]` | Rating badge + tier colour on the name, rating graph (inline SVG), badge shelf, streak, certificates |
| `/u/[id]/rating` *(new)* | Full rating history table with per-contest deltas |
| `/seasons/[slug]` *(new)* | Season final table + award winners |
| `/verify/[certificateId]` *(new)* | Public verification page |
| `components/RatingBadge.tsx` *(new)* | Tier-coloured rating chip, used everywhere a name appears |
| `components/RatingGraph.tsx` *(new)* | Dependency-free SVG line chart with tier bands |
| `components/BadgeShelf.tsx` *(new)* | Grid with tooltips and earned dates |

Rating changes are the most-anticipated moment after a contest. Send a
notification (Phase 11) with the delta and animate the delta on the profile the
first time it is viewed.

---

## Testing plan

| Tier | Test |
|---|---|
| Unit | Elo-MMR against the reference implementation's published test vectors |
| Unit | Determinism: shuffled contest processing order → identical final ratings |
| Unit | A new competitor's σ shrinks appropriately over 5 contests; displayed rating is conservative early |
| Unit | Badge rules: each type at its boundary; duplicate award is a no-op |
| Unit | Streak: consecutive days, a gap consumed by a freeze, a gap without one, timezone boundary (use the user's timezone, not UTC) |
| Unit | Institution aggregate uses top 10 and requires ≥ 10 verified members |
| Integration | Ending a rated contest writes one `RatingEvent` per official participant and updates `UserRating` |
| Integration | A virtual participant receives no rating change |
| Integration | Unverified users are excluded from the national board but see their own provisional rank |
| Integration | Certificate signature verifies; a tampered payload fails |
| Perf | National leaderboard page 1 in ≤ 300 ms with 25k users (cached) |

Timezone handling for streaks deserves emphasis: computing "days" in UTC means a
student in Dhaka (UTC+6) loses a streak by solving at 11pm. Use the user's
timezone, defaulting to `Asia/Dhaka`.

---

## Acceptance criteria

1. Ending a rated public contest updates every official participant's rating with
   a visible delta and a history entry, computed from the immutable snapshot.
2. Re-running the rating computation from scratch reproduces identical ratings.
3. The national leaderboard ranks only verified users; unverified users see a
   prompt explaining how to appear.
4. The institution table ranks universities by top-10 aggregate.
5. A student's profile shows tier colour, rating graph, badges, streak and
   certificates.
6. Badges award automatically on all three triggers and never duplicate.
7. A streak survives one missed day when a freeze is held.
8. A certificate verifies at a public URL and fails verification if tampered.
9. Problem Elo is computed and displayed alongside the author's label.

## Rollback

`ratings` off hides rating UI and skips post-contest rating jobs. Rating data is
additive and recomputable, so a rollback loses nothing permanently.

## Risks

| Risk | Mitigation |
|---|---|
| A rating bug corrupts history | Full replay from snapshots is the standard repair; `engineVersion` on every event makes a change visible |
| Rating farming via self-organised contests | Only `PUBLIC` contests with ≥ 20 official participants are rated by default; admin can rate others explicitly |
| Multi-accounting on the national board | Verified institution requirement, one account per email, and a Phase 10 fingerprint check flagging duplicate submission patterns across accounts |
| Leaderboard becomes discouraging for beginners | Default view is the viewer's institution, not national; "most improved" and tier-relative progress are surfaced above absolute rank |
| Institution ranking causes inter-university friction | Only verified institutions; a clear methodology page; institutions can opt out of the public comparison |
| Certificates over-claim | Payload states exactly what was achieved (rank, field size, date); no vague wording |

## Definition of done

- [ ] Elo-MMR implemented, deterministic, verified against reference vectors
- [ ] Rating events written from standings snapshots; full recompute available
- [ ] Tiers with theme-safe colours everywhere a user is displayed
- [ ] National / institution / department leaderboards with verification gating
- [ ] Institution-vs-institution table
- [ ] Seasons with archived standings and season badges
- [ ] ~30 badges with a declarative rule engine; three triggers; idempotent
- [ ] Streaks with freezes and correct timezone handling
- [ ] Problem Elo computed and displayed
- [ ] Signed, publicly verifiable certificates with PDF + QR
