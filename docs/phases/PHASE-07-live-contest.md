# Phase 7 — Live Contest Experience

> **Execute with**: "execute Phase 7"
> **Effort**: 10–14 days · **Flag**: `liveContest`
> **Depends on**: Phase 4, 5 · **Unblocks**: nothing hard; raises contest quality

---

## Goal

Close the gap with Codeforces/Toph during the two hours that matter most: live
announcements, clarification threads, a scoreboard that updates without a
refresh, ICPC team contests, balloons, and a projector-friendly public display.

## Why now

The contest engine (Phase 5) and realtime infrastructure (Phase 4) exist. This
phase spends them. It is also the phase that makes an *inter-university* contest
credible — a coach will not bring a team to a platform where a clarification takes
ten minutes to reach everyone.

## Scope

- `ContestAnnouncement` — broadcast, delivered live
- `ContestClarification` — private threads, promotable to broadcast
- Realtime standings over SSE + Redis
- Team contests: `Team`, `TeamMember`, team-scoped participation and scoreboard
- Balloons queue for physical contests
- Public display mode (projector scoreboard, freeze-aware, auto-advancing)
- Coach/squad view

---

## Design decisions

### D1 — A clarification is a thread that can be promoted

The lifecycle a real contest needs:

```
student asks (private, attached to a problem or general)
   → staff sees it in a queue with the problem context
   → staff answers privately            → thread resolved, asker notified
   → OR staff promotes to announcement  → visible to everyone, asker credited or anonymous
   → OR staff answers "No comment"      → the canonical ICPC non-answer, one click
```

"No comment" as a one-click canned response matters more than it sounds: it is
the most common answer in a real contest and staff will be answering under time
pressure. Provide three canned responses: *No comment.*, *Read the problem
statement carefully.*, *This has been answered in an announcement.*

### D2 — Realtime standings are a Redis-backed read model

Recomputing a 500-participant scoreboard on every page view during a contest is
the wrong shape. Instead:

- On each judged submission for a live contest, the worker publishes a
  `standings:dirty:{contestId}` event.
- A debouncer (2 s window) recomputes the standings via the Phase 5 engine and
  writes the result to a Redis key plus a sorted set for rank lookups.
- SSE subscribers receive a diff (changed rows only), not the whole board.
- The full board is served from Redis; a miss falls back to computing from
  Postgres and repopulating.

The 2-second debounce is deliberate: it caps recomputation at 30/minute per
contest regardless of submission rate, and no human perceives 2 s of scoreboard
lag.

**Diff-based SSE** matters at scale: a 500-row board is ~80 KB of JSON. Pushing
it every 2 s to 500 connected clients is 20 MB/s. Pushing only changed rows is a
few hundred bytes.

### D3 — Teams are a participation wrapper, not a parallel universe

A team contest reuses `ContestParticipation` with `teamId` set. Submissions
belong to a user (who typed it) *and* resolve to a team (who is scored). The
scoreboard groups by `teamId ?? userId` — one line of change in the engine, not a
second engine.

`Contest.rules.teamSize` gates registration. Team formation happens before the
contest: a captain creates a team, gets a code, teammates join. During the
contest, one shared clock, shared submission limits, and shared penalty.

### D4 — Public display is a separate, dumb page

`/contests/[slug]/display` — no navigation, no auth prompt, high contrast, large
type, auto-scrolling through the standings, freeze indicator, and a resolver mode
for the post-contest reveal. Built for a projector at the back of a lab.

It is a separate route rather than a mode of the main scoreboard because the
constraints conflict: the display needs 24px+ type and no interactivity; the
normal board needs density and filters.

---

## Schema

```prisma
model ContestAnnouncement {
  id        String   @id @default(cuid())
  contestId String
  problemId String?                          // scoped to one problem, or general
  title     String   @default("")
  body      String
  /// Promoted from this clarification, if any.
  sourceClarificationId String? @unique
  authorId  String
  createdAt DateTime @default(now())

  contest Contest @relation(fields: [contestId], references: [id], onDelete: Cascade)
  author  User    @relation(fields: [authorId], references: [id])

  @@index([contestId, createdAt])
}

enum ClarificationStatus { OPEN ANSWERED PROMOTED CLOSED }

model ContestClarification {
  id         String              @id @default(cuid())
  contestId  String
  userId     String
  teamId     String?
  problemId  String?
  question   String
  answer     String?
  status     ClarificationStatus @default(OPEN)
  answeredById String?
  answeredAt DateTime?
  createdAt  DateTime            @default(now())

  contest Contest @relation(fields: [contestId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([contestId, status, createdAt])
  @@index([userId])
}

model Team {
  id         String   @id @default(cuid())
  contestId  String?                         // null = a persistent squad (coach view)
  name       String
  joinCode   String   @unique
  captainId  String
  coachId    String?
  institutionId String?
  createdAt  DateTime @default(now())

  contest Contest?     @relation(fields: [contestId], references: [id], onDelete: Cascade)
  members TeamMember[]
  participations ContestParticipation[]

  @@unique([contestId, name])
  @@index([coachId])
}

model TeamMember {
  teamId   String
  userId   String
  role     String   @default("MEMBER")       // CAPTAIN | MEMBER
  joinedAt DateTime @default(now())

  team Team @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([teamId, userId])
}

model Balloon {
  id             String   @id @default(cuid())
  contestId      String
  participationId String
  problemId      String
  color          String                       // from ContestProblem.balloonColor
  deliveredAt    DateTime?
  deliveredById  String?
  createdAt      DateTime @default(now())

  @@unique([participationId, problemId])
  @@index([contestId, deliveredAt])
}

model ContestProblem {
  // ...existing
  balloonColor String?                        // "#e11d48"
}
```

Migration `0017_live_contest`: additive.

---

## Realtime standings implementation

```
src/lib/standings/
  live.ts        # Redis read model: get, invalidate, recompute-with-debounce
  diff.ts        # row-level diff between two standings payloads
  channel.ts     # pub/sub channel naming + payload schemas
```

Redis keys:

| Key | Type | Contents |
|---|---|---|
| `standings:{contestId}:payload` | string (JSON) | Full computed standings + version |
| `standings:{contestId}:rank` | zset | `userId/teamId` → score, for O(log n) rank lookup |
| `standings:{contestId}:dirty` | string | Debounce marker with a TTL |
| `contest:{contestId}:events` | pub/sub | Announcements, clarification answers, standings diffs |

SSE endpoint `/api/contests/[id]/stream` multiplexes all three event kinds onto
one connection — a client in a contest should hold exactly one stream, not three.

```
event: standings
data: {"version":412,"changed":[{"rank":3,"id":"u_x","solved":4,"penalty":221,"cells":{...}}]}

event: announcement
data: {"id":"a_1","title":"Clarification for B","body":"...","problemId":"p_2"}

event: clarification
data: {"id":"c_9","status":"ANSWERED"}
```

Authorisation on the stream is per-event: announcements go to everyone with
`view`; clarification events only to the asker and staff; standings respect the
freeze for non-staff.

---

## API contracts

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/contests/[id]/stream` | capability `view` | Multiplexed SSE |
| `GET/POST` | `/api/contests/[id]/announcements` | view / staff | — |
| `GET/POST` | `/api/contests/[id]/clarifications` | participant / staff | Students see only their own |
| `POST` | `/api/contests/[id]/clarifications/[cid]/answer` | staff | `{ answer, promote? }` |
| `POST` | `/api/contests/[id]/teams` | session | Create a team, returns a join code |
| `POST` | `/api/contests/[id]/teams/join` | session | `{ joinCode }` |
| `GET` | `/api/contests/[id]/balloons` | staff | Undelivered queue |
| `POST` | `/api/contests/[id]/balloons/[bid]/deliver` | staff | — |
| `GET` | `/api/coach/squads` | teacher/coach | Persistent squads + their contest history |

---

## Frontend surfaces

| Route / component | Work |
|---|---|
| `components/contest/ContestSidebar.tsx` *(new)* | Announcements feed + "Ask a question" + my clarification threads, with unread badges |
| `components/contest/LiveStandings.tsx` *(new)* | SSE-driven table with row-level transitions; highlights the viewer's row; sticky |
| `components/contest/ClarificationQueue.tsx` *(new)* | Staff triage: filter by problem/status, canned answers, answer-and-promote in one action |
| `app/contests/[slug]/display/page.tsx` *(new)* | Projector mode; `?rows=20&interval=15` for auto-advance; resolver mode |
| `components/contest/TeamPanel.tsx` *(new)* | Create/join a team, member list, captain controls |
| `app/contests/[slug]/balloons/page.tsx` *(new)* | Runner-facing queue, one big "Delivered" button per row, ordered by age |
| `app/coach/page.tsx` *(new)* | Squad roster, contest-by-contest results, per-member trend |
| `components/contest/ContestClock.tsx` | Extended: freeze countdown, "contest ends in" urgency states |

The resolver (post-contest reveal, ICPC-style bottom-up unfreeze one cell at a
time) is a genuinely delightful piece of theatre for a departmental contest and
costs about a day. Include it — it is the thing that gets a contest photographed
and shared.

---

## Testing plan

| Tier | Test |
|---|---|
| Unit | Standings diff produces only changed rows; a rank shift cascades correctly |
| Unit | Debounce coalesces 50 events in 2 s into one recompute |
| Unit | Team scoreboard groups by team; individual submissions attributed to the typist |
| Integration | Announcement reaches a connected client in < 2 s |
| Integration | A clarification is visible to its asker and staff, and to nobody else — asserted on the SSE payload, not just the page |
| Integration | Promoting a clarification creates an announcement and marks the thread `PROMOTED` |
| Integration | Frozen standings over SSE: a non-staff client receives no post-freeze changes for other participants but does receive their own |
| Load | 300 concurrent SSE clients on one contest: server memory stable, diff payloads < 2 KB, no dropped events |

---

## Acceptance criteria

1. An announcement posted by staff appears on every connected participant's
   screen within 2 seconds, with no refresh.
2. Standings update live and never reveal frozen information to non-staff, while
   always showing a participant their own results.
3. A clarification thread is private to the asker and staff; promoting it
   broadcasts to all.
4. A 3-person team registers, submits from any member's account, and appears as
   one scoreboard row.
5. The projector display is readable from the back of a lab and auto-advances
   through a 200-row board.
6. Balloon runners see an ordered undelivered queue that updates live.
7. 300 concurrent SSE connections on one contest are stable for two hours.

## Rollback

`liveContest` off falls back to polled standings and hides the sidebar. Contests
remain fully functional — this phase is quality, not capability.

## Risks

| Risk | Mitigation |
|---|---|
| SSE connection limits at scale | One multiplexed stream per client; measured at 300; documented ceiling and the polling fallback |
| A standings recompute storm during the final minutes | Debounce + a hard floor of 2 s between recomputes per contest; recompute is the Phase 5 pure function, cheap |
| Clarification leak across teams | Per-event authorisation on the stream, with an integration test asserting on raw payloads |
| Staff overwhelmed by clarifications | Canned answers, problem filters, and a per-problem "answered" indicator so duplicates are obvious |
| Teams complicate scoring | Grouping key is the only engine change; property tests cover both modes |

## Definition of done

- [ ] Multiplexed SSE stream with per-event authorisation
- [ ] Announcements + clarification threads with promote and canned answers
- [ ] Live diff-based standings backed by Redis
- [ ] Team contests end to end, including a team scoreboard
- [ ] Balloon queue
- [ ] Projector display + resolver
- [ ] Coach/squad view
- [ ] 300-client SSE load test green
