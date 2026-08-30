# Phase 11 — Community, Editorials & Notifications

> **Execute with**: "execute Phase 11"
> **Effort**: 10–12 days · **Flag**: `community`
> **Depends on**: Phase 2, 5 · **Unblocks**: nothing hard; drives retention

---

## Goal

Turn solved problems into learning: editorials, threaded discussion, solution
sharing, and a notification system that brings people back without becoming spam.

## Why now

The archive is large and the contests are running, but a student who fails a
problem has nowhere to go. Editorials are the highest-leverage retention feature
on any judge — the moment a student learns *why* their approach was wrong is the
moment they come back tomorrow.

## Scope

- Editorials per problem version, with spoiler gating
- Threaded discussion on problems, contests and editorials
- Solution sharing (opt-in, post-solve only)
- Notification centre: in-app, email, web push
- Notification preferences with sane defaults
- Moderation: report, hide, ban-from-commenting, an audit trail

---

## Design decisions

### D1 — Spoiler gating is the whole design problem

A student browsing a problem must not see the solution by accident, and must not
see it at all while a contest using that problem is live.

Rules, evaluated server-side (never client-side hiding — a hidden solution in the
DOM is not hidden):

| Content | Visible when |
|---|---|
| Editorial | The viewer has solved the problem, **or** the problem is not in any live contest and the viewer explicitly clicks "show editorial", **or** the viewer is staff |
| Discussion thread marked `spoiler` | Same |
| Shared solutions | The viewer has solved the problem. Full stop — no reveal button. |
| Any of the above during a live contest containing the problem | Staff only |

The "explicitly clicks" path matters: gating editorials behind solving is
punitive for a beginner who is genuinely stuck. Gate behind a deliberate action
plus a clear warning, not behind achievement — except for other people's
solutions, where solving first is the right bar.

Determining "is this problem in a live contest" on every problem page view must
not be a query. Maintain a Redis set `live-contest-problems` updated by the
contest lifecycle tick.

### D2 — Comments are one level deep

Threads, not trees. A top-level comment plus replies, no nesting beyond that.
Deep threading is a moderation burden and a UI problem, and Codeforces' flat-ish
model works fine for this audience.

Markdown with the same sanitiser as statements, plus code fences with syntax
highlighting. `@mention` autocompletes and produces a notification.

### D3 — Notification preferences default to quiet

Every notification type has three channels (in-app, email, push) and a per-user
preference. Defaults matter enormously: get them wrong and users mute everything,
after which no notification ever works again.

| Type | In-app | Email | Push |
|---|---|---|---|
| Contest starting in 1 h (registered) | on | on | on |
| Contest ended, results ready | on | off | on |
| Rating changed | on | off | on |
| Assignment due in 24 h | on | on | on |
| Assignment graded | on | off | off |
| Clarification answered | on | off | on |
| Reply to my comment | on | off | off |
| @mention | on | off | off |
| Class announcement | on | on | on |
| Badge earned | on | off | off |
| Teacher approved | on | on | off |

Email defaults on only for things with a deadline or that the user cannot
discover on their own. Everything else is in-app.

Digest option: "one daily email instead of individual" — the escape valve for
anyone who finds the defaults noisy.

### D4 — Notification delivery is queued, never inline

Creating a notification writes a row and enqueues delivery. A contest start
notifying 500 registrants must not happen inside the lifecycle tick. Email and
push go through BullMQ with retries and a bounce/unsubscribe path.

---

## Schema

```prisma
model Editorial {
  id               String   @id @default(cuid())
  problemId        String
  problemVersionId String?
  authorId         String
  contentMd        String
  /// Optional reference implementations shown with the editorial.
  solutions        Json     @default("[]")   // [{language, source, note}]
  published        Boolean  @default(false)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  problem Problem @relation(fields: [problemId], references: [id], onDelete: Cascade)
  author  User    @relation(fields: [authorId], references: [id])

  @@unique([problemId, problemVersionId])
  @@index([problemId, published])
}

enum CommentTarget { PROBLEM CONTEST EDITORIAL ANNOUNCEMENT }

model Comment {
  id        String        @id @default(cuid())
  target    CommentTarget
  targetId  String
  parentId  String?
  userId    String
  body      String
  spoiler   Boolean       @default(false)
  score     Int           @default(0)
  editedAt  DateTime?
  hiddenAt  DateTime?
  hiddenById String?
  hiddenReason String?
  createdAt DateTime      @default(now())

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  parent   Comment?  @relation("Replies", fields: [parentId], references: [id], onDelete: Cascade)
  replies  Comment[] @relation("Replies")
  votes    CommentVote[]

  @@index([target, targetId, createdAt])
  @@index([parentId])
  @@index([userId])
}

model CommentVote {
  commentId String
  userId    String
  value     Int      // +1 | -1

  comment Comment @relation(fields: [commentId], references: [id], onDelete: Cascade)
  @@id([commentId, userId])
}

model SharedSolution {
  id           String   @id @default(cuid())
  problemId    String
  userId       String
  submissionId String   @unique
  language     String
  note         String   @default("")
  score        Int      @default(0)
  createdAt    DateTime @default(now())

  @@unique([problemId, userId])
  @@index([problemId, score])
}

enum NotificationChannel { INAPP EMAIL PUSH }

model Notification {
  id        String   @id @default(cuid())
  userId    String
  type      String
  title     String
  body      String   @default("")
  href      String?
  payload   Json     @default("{}")
  readAt    DateTime?
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, readAt, createdAt])
}

model NotificationPreference {
  userId   String
  type     String
  channels NotificationChannel[]

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([userId, type])
}

model PushSubscription {
  id        String   @id @default(cuid())
  userId    String
  endpoint  String   @unique
  p256dh    String
  auth      String
  userAgent String   @default("")
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}

model ContentReport {
  id         String   @id @default(cuid())
  target     String                  // "comment" | "solution" | "profile"
  targetId   String
  reporterId String
  reason     String
  status     String   @default("OPEN")  // OPEN | ACTIONED | DISMISSED
  handledById String?
  handledAt  DateTime?
  createdAt  DateTime @default(now())

  @@index([status, createdAt])
}
```

Migration `0020_community`: additive.

---

## Notification pipeline

```
src/lib/notify/
  index.ts        # notify(userId | userIds, type, payload) — the only entry point
  types.ts        # type registry: title/body templates, default channels, href builder
  channels/
    inapp.ts      # Notification row + Redis pub/sub for the live bell
    email.ts      # reuses src/lib/mail.ts, respects the digest preference
    push.ts       # web-push with VAPID
  digest.ts       # daily rollup job
  queue.ts        # BullMQ producer/consumer
```

`notify()` is the single call site. Everything else — preference resolution,
channel fan-out, batching, retry — happens behind it. Emitters live at the
existing event points (contest lifecycle, grading, clarification answer, comment
reply, rating computation) as one-line calls.

Bulk fan-out (a contest starting for 500 registrants) creates rows in one
`createMany` and enqueues one batched delivery job per channel, not 500 jobs.

**Unsubscribe** is a signed link in every email, honoured without login, and it
sets the preference rather than blacklisting the address — so a user who
unsubscribes from contest reminders still gets their grade notification.

---

## API contracts

| Method | Path | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/notifications` | session | Paged, `?unread=1` |
| `POST` | `/api/notifications/read` | session | `{ ids? }` — omit for all |
| `GET/PUT` | `/api/notifications/preferences` | session | — |
| `POST` | `/api/push/subscribe` | session | VAPID subscription |
| `GET` | `/api/problems/[id]/editorial` | gated | 403 with a reason when gated |
| `POST` | `/api/teacher/problems/[id]/editorial` | author/admin | — |
| `GET/POST` | `/api/comments` | public / session | `?target=&targetId=` |
| `PATCH/DELETE` | `/api/comments/[id]` | author / moderator | Edit window 15 min |
| `POST` | `/api/comments/[id]/vote` | session | — |
| `POST` | `/api/solutions/share` | session | `{ submissionId, note }` — requires an AC |
| `GET` | `/api/problems/[id]/solutions` | solved-gated | — |
| `POST` | `/api/reports` | session | — |
| `GET/POST` | `/api/admin/reports` | admin/moderator | Moderation queue |

---

## Frontend surfaces

| Route / component | Work |
|---|---|
| `components/NotificationBell.tsx` *(new)* | Unread count, dropdown, mark-read, live via the Phase 7 SSE channel |
| `app/notifications/page.tsx` *(new)* | Full history |
| `app/profile/settings` | Notification preference matrix (type × channel), digest toggle, push enable |
| `app/problems/[id]/page.tsx` | Tabs: Statement · Editorial · Discussion · Solutions, each server-gated |
| `components/community/CommentThread.tsx` *(new)* | One-level threads, markdown, mentions, vote, report, spoiler blur |
| `components/community/EditorialView.tsx` *(new)* | Gated reveal with an explicit warning; code blocks per language |
| `components/community/ShareSolution.tsx` *(new)* | Appears after an AC |
| `app/admin/moderation/page.tsx` *(new)* | Report queue, hide/restore, comment bans |

---

## Testing plan

| Tier | Test |
|---|---|
| Unit | Gating matrix: 4 content types × (solved, unsolved, live-contest, staff) |
| Unit | Preference resolution falls back to type defaults; explicit off wins |
| Unit | Digest batching collapses N notifications into one email |
| Integration | Editorial content is absent from the response body when gated — asserted on raw JSON/HTML, not on the rendered page |
| Integration | Solutions are unreachable before solving, including by direct API call |
| Integration | During a live contest, staff see the editorial and participants do not |
| Integration | 500-registrant contest start creates 500 rows and ≤ 3 delivery jobs |
| Integration | Unsubscribe link works without login and scopes to one type |
| Integration | Comment sanitisation strips scripts; a mention notifies exactly once |

---

## Acceptance criteria

1. A student who has not solved a problem cannot obtain its shared solutions by
   any means, including a direct API request.
2. An editorial is revealed only after a deliberate action with a warning, and
   never during a live contest containing that problem.
3. A contest-start notification reaches 500 registrants via in-app, email and
   push within 60 seconds, using batched jobs.
4. Notification preferences are per type and per channel, with quiet defaults.
5. Unsubscribing from one type does not silence the others.
6. Comments render Markdown safely, thread one level, and support mentions.
7. Reported content reaches a moderation queue and can be hidden with an audit
   trail.

## Rollback

`community` off hides the tabs, the bell and the notification jobs. Data is
additive.

## Risks

| Risk | Mitigation |
|---|---|
| Solution leak during a live contest | Server-side gating with a Redis live-contest-problem set; explicit tests asserting on raw payloads |
| Notification fatigue → everything muted | Quiet defaults, digest option, per-type granularity, and no marketing notifications ever |
| Comment spam / abuse | Rate limits, new-account restrictions (no comments until first AC), report queue, comment bans |
| Editorials never get written | Teachers can attach an editorial when authoring (Phase 2 flow); AI drafting arrives in Phase 15 |
| Email deliverability | SPF/DKIM/DMARC documented; move to a transactional provider (Resend/SES) before volume; bounce handling disables dead addresses |

## Definition of done

- [ ] Editorials with spoiler gating and live-contest protection
- [ ] One-level threaded comments with markdown, mentions, votes, reports
- [ ] Opt-in solution sharing gated on solving
- [ ] Notification centre: rows, live bell, full history
- [ ] Per-type × per-channel preferences with quiet defaults and a digest
- [ ] Email + web push delivery, queued and batched, with working unsubscribe
- [ ] Moderation queue with audit trail
- [ ] All gating verified against raw response payloads
