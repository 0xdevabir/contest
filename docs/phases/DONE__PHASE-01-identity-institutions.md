# Phase 1 — Identity, Institutions & RBAC

> **Execute with**: "execute Phase 1"
> **Effort**: 8–10 days · **Flags**: `institutions`, `teacherRole`
> **Depends on**: Phase 0 · **Unblocks**: 2, 5, 6, 9 (and the national leaderboard)

---

## Goal

Replace the four-value `University` enum with a real `Institution` table, expand
`Role` from `USER | ADMIN` to `STUDENT | TEACHER | TA | ADMIN` with an approval
workflow, add email-domain-based institution verification, and harden sessions
with refresh rotation and revocation.

## Why now

Two independent reasons converge on doing this first, right after the safety net:

1. **The enum is a hard ceiling on the moat.** A national leaderboard across
   Bangladeshi universities needs ~150 institutions with district, type, logo and
   verified email domains. A Postgres enum needs a migration per value and can
   store none of that metadata. Every leaderboard query, every registration path
   and every profile touches `University`, so the cost of this migration grows
   with the codebase and with the row count. Do it while `User` has hundreds of
   rows, not hundreds of thousands.

2. **Nothing teacher-shaped can be built without the role.** Phases 2, 5 and 6
   all hang permissions off TEACHER. Building them first means writing
   `if (user.role === "ADMIN")` in forty places and unwinding it later.

## Scope

- `Institution`, `InstitutionDomain` models; `University` enum retired
- `Role` expansion with a safe enum migration
- Teacher self-signup → admin approval workflow
- Email-domain auto-verification of institution membership
- `authz.ts` filled in with real role and ownership rules
- Session hardening: refresh rotation, `Session` table, revocation, single-session
  mode primitive (used by Phase 10)
- Admin surfaces: institution CRUD, teacher approval queue
- Seed data: ~60 Bangladeshi universities

---

## Design decisions

### D1 — `Institution` is a table, not a bigger enum

Rejected: keeping an enum and adding values. An enum cannot carry `district`,
`logoUrl`, `verifiedDomains`, or `isVerified`, and a national board needs all
four. Also rejected: a free-text `institution` string on `User` — that produces
"DIU", "Daffodil", "daffodil international university" as three institutions on
day one, which destroys the leaderboard's credibility.

### D2 — Institution membership is *claimed*, then *verified*

`User.institutionId` is what the student picked. `User.institutionVerifiedAt` is
non-null only when we have evidence. Evidence is either:

- **Domain match** — the verified email's domain matches an
  `InstitutionDomain` row (`@diu.edu.bd` → DIU). Automatic, instant, free.
- **Manual approval** — an admin or an approved teacher at that institution
  vouches. For students on Gmail, which in Bangladesh is most of them.

National leaderboards rank **verified** users; unverified users see their rank
greyed with a "verify to appear" prompt. This is the entire anti-fraud story for
the moat and it costs one boolean and one join.

### D3 — Four roles, and TA is a scoped role, not a global one

`STUDENT | TEACHER | TA | ADMIN` as the *global* role. But a TA is a TA **of a
specific section**, which is section-scoped data introduced in Phase 6. So:

- Global `Role.TA` grants nothing on its own. It is a marker that this account
  may be *assigned* TA duties.
- Actual TA capability comes from `Enrollment.role = 'TA'` on a specific section
  (Phase 6) or `ContestStaff` on a specific contest (Phase 5).

This avoids the classic mistake where a TA in one course can grade another
course. `can()` therefore takes a resource, always.

### D4 — Rename `USER` → `STUDENT` with a two-step enum migration

Postgres cannot rename an enum value inside a transaction that also uses it, and
Prisma's generated migration for an enum change is a drop-and-recreate that fails
on dependent columns. The safe path:

```sql
-- Step 1 (expand): add the new value alongside the old
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'STUDENT';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'TEACHER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'TA';
-- (ADD VALUE cannot run inside a transaction block — mark the migration
--  as non-transactional or split into separate migration files.)

-- Step 2 (backfill): in a later migration
UPDATE "User" SET role = 'STUDENT' WHERE role = 'USER';

-- Step 3 (contract): recreate the type without 'USER'
CREATE TYPE "Role_new" AS ENUM ('STUDENT','TEACHER','TA','ADMIN');
ALTER TABLE "User" ALTER COLUMN role DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN role TYPE "Role_new" USING role::text::"Role_new";
ALTER TABLE "User" ALTER COLUMN role SET DEFAULT 'STUDENT';
DROP TYPE "Role"; ALTER TYPE "Role_new" RENAME TO "Role";
```

Three deploys. Application code between steps 1 and 3 must read both `USER` and
`STUDENT` as "student" — a single `normalizeRole()` helper, deleted at contract.

### D5 — Sessions become revocable

Today the JWT is the session; there is no way to log someone out of another
device or to enforce one-session-per-user during an exam. Add a `Session` table
holding a rotating refresh token hash. The access JWT stays short-lived (30 min)
and carries `sid`; `getSession()` verifies the JWT and, on a cache miss, checks
the `Session` row is live. Revocation = delete the row.

This is the primitive Phase 10 needs for exam session binding, and it fixes the
present inability to force-logout a suspended user.

---

## Schema changes

```prisma
enum Role {
  STUDENT
  TEACHER
  TA
  ADMIN
}

enum InstitutionType {
  PUBLIC_UNIVERSITY
  PRIVATE_UNIVERSITY
  NATIONAL_UNIVERSITY_COLLEGE
  POLYTECHNIC
  COLLEGE
  SCHOOL
  OTHER
}

model Institution {
  id           String          @id @default(cuid())
  slug         String          @unique          // "diu", "buet", "nsu"
  name         String                            // "Daffodil International University"
  shortName    String                            // "DIU"
  type         InstitutionType @default(PRIVATE_UNIVERSITY)
  district     String?                           // "Dhaka"
  division     String?                           // "Dhaka"
  websiteUrl   String?
  logoUrl      String?
  /// Admin-verified as a real institution. Unverified ones are hidden from
  /// public leaderboards but can still be selected during registration.
  verified     Boolean         @default(false)
  /// Denormalised counters, refreshed by the nightly stats job (Phase 9).
  memberCount  Int             @default(0)
  solvedCount  Int             @default(0)
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt

  domains      InstitutionDomain[]
  users        User[]
  departments  Department[]        // Phase 6

  @@index([verified, memberCount])
  @@index([district])
}

model InstitutionDomain {
  id            String  @id @default(cuid())
  institutionId String
  /// Lowercase, no leading '@'. e.g. "diu.edu.bd", "s.diu.edu.bd"
  domain        String  @unique
  /// Domains that only students get (vs. faculty) can auto-assign a role hint.
  roleHint      Role?

  institution Institution @relation(fields: [institutionId], references: [id], onDelete: Cascade)

  @@index([institutionId])
}

model User {
  // ...existing fields
  role                   Role      @default(STUDENT)

  institutionId          String?
  institution            Institution? @relation(fields: [institutionId], references: [id], onDelete: SetNull)
  /// Non-null once membership is proven (domain match or manual approval).
  institutionVerifiedAt  DateTime?
  institutionVerifiedBy  String?    // userId of the approver, null for automatic

  /// Teacher accounts are inert until an admin approves them.
  teacherApprovedAt      DateTime?
  teacherApprovedBy      String?
  teacherRequestNote     String?    @default("")

  /// Retained through the contract step of the enum migration, then dropped.
  university             University?

  sessions               Session[]

  @@index([institutionId, institutionVerifiedAt])
  @@index([role, teacherApprovedAt])
}

model Session {
  id               String   @id @default(cuid())
  userId           String
  /// SHA-256 of the refresh token. The token itself is never stored.
  refreshTokenHash String   @unique
  userAgent        String   @default("")
  ip               String   @default("")
  /// Set when this session is bound to a strict-mode contest (Phase 10).
  boundContestId   String?
  createdAt        DateTime @default(now())
  lastSeenAt       DateTime @default(now())
  expiresAt        DateTime
  revokedAt        DateTime?
  revokedReason    String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, revokedAt])
  @@index([expiresAt])
}
```

### Migration plan

| Migration | Step | Contents |
|---|---|---|
| `0002_role_expand` | expand | `ALTER TYPE Role ADD VALUE` × 3 (non-transactional) |
| `0003_institutions` | expand | `Institution`, `InstitutionDomain`, `Session`; nullable `User.institutionId`, `institutionVerifiedAt`, `teacherApprovedAt`, … |
| `scripts/migrations/0004-backfill-institutions.ts` | backfill | Seed 60 institutions; map each `User.university` enum value to the matching `institutionId`; set `institutionVerifiedAt = now()` for existing users (they were vetted by the old flow); `UPDATE role='STUDENT' WHERE role='USER'` |
| `0005_role_contract` | contract | Recreate `Role` without `USER`; `User.university` → nullable, then dropped in `0006` after a soak period |
| `0006_drop_university_enum` | contract | Drop `User.university`; `DROP TYPE "University"` |

**Reconciliation query** run between backfill and contract — must return 0:

```sql
SELECT count(*) FROM "User"
WHERE "institutionId" IS NULL OR role::text = 'USER';
```

**Down-path**: `0006` and `0005` are irreversible without a restore, which is why
they ship at least one release after the backfill verifies clean. `0002`–`0004`
are safe to leave in place indefinitely — the system runs correctly in the
expanded state.

---

## Institution seed data

`prisma/seeds/institutions.ts` — approximately 60 rows covering:

- **Public**: BUET, DU, RUET, CUET, KUET, SUST, JU, RU, CU, JnU, BUP, MIST,
  IUT, NSTU, HSTU, PUST, BSMRSTU, JUST, PSTU, BAU, …
- **Private**: DIU, NSU, BRACU, AIUB, EWU, IUB, UIU, AUST, SEU, UAP, GUB,
  Primeasia, Stamford, ULAB, NUB, BUBT, IUBAT, CUB, …
- **Domains** where publicly known: `diu.edu.bd`, `s.diu.edu.bd`, `buet.ac.bd`,
  `northsouth.edu`, `bracu.ac.bd`, `aiub.edu`, `du.ac.bd`, `sust.edu`, …

Idempotent upsert keyed on `slug`, so re-running the seed adds new institutions
without touching existing rows. Mark all seeded rows `verified: true`.

Include an `OTHER` institution (`slug: "other"`, `verified: false`) so a student
from an unlisted college can still register; admin can promote it later by
reassigning users.

---

## Backend work

### `src/lib/institutions.ts` (new — replaces `universities.ts`)

```ts
export async function listInstitutions(opts?: {
  q?: string; verifiedOnly?: boolean; limit?: number;
}): Promise<InstitutionOption[]>;

/** Returns the institution whose verified domain matches this email, if any. */
export async function matchInstitutionByEmail(email: string): Promise<
  { institutionId: string; roleHint: Role | null } | null
>;

export async function verifyMembership(
  userId: string,
  by: { kind: "domain" } | { kind: "manual"; approverId: string },
): Promise<void>;
```

`matchInstitutionByEmail` matches the *longest* domain suffix, so
`s.diu.edu.bd` wins over `diu.edu.bd` when both are registered — that is how a
student-only subdomain carries a `roleHint`.

Keep `universities.ts` as a deprecated shim exporting `universityLabel` backed by
the new table for the duration of the migration; delete at contract.

### `src/lib/authz.ts` (fill in)

```ts
const RULES: Record<Action, (a: Actor, r?: Resource) => boolean> = {
  "contest:create":  (a) => isAdmin(a) || isApprovedTeacher(a),
  "contest:edit":    (a, r) => isAdmin(a) || (isApprovedTeacher(a) && owns(a, r)),
  "problem:create":  (a) => isAdmin(a) || isApprovedTeacher(a),
  "problem:viewHiddenTests": (a, r) => isAdmin(a) || owns(a, r),
  "submission:viewAny": (a) => isAdmin(a),
  "user:manage":     (a) => isAdmin(a),
  // ...
};

function isApprovedTeacher(a: Actor) {
  return a?.role === "TEACHER" && a.teacherApprovedAt != null;
}
```

`teacherApprovedAt` must therefore be in the session payload. Add it to
`SessionClaims`, and make `refreshSessionFromDb` the path that picks it up after
approval so a teacher does not need to log out and back in.

### Session hardening — `src/lib/auth.ts`

| Change | Detail |
|---|---|
| Access token TTL | 30 minutes (was: long-lived) |
| Refresh token | 30 days, opaque 32-byte random, stored hashed in `Session` |
| Rotation | Every refresh issues a new refresh token and revokes the old one |
| Reuse detection | Presenting an already-revoked refresh token revokes the **entire** session family and logs a security event — the standard defence against stolen refresh tokens |
| Revocation | `revokeSession(sid)`, `revokeAllSessions(userId, reason)`; called on password change, suspension, and by the user from profile settings |
| `getSession()` | Verifies JWT, then checks `Session.revokedAt IS NULL` (cached 60 s in memory, invalidated on revoke) |
| Cookie | Refresh token in an `HttpOnly`, `SameSite=Lax`, `Secure`, `Path=/api/auth` cookie so it is not sent with every request |

`POST /api/auth/refresh` is new. The client refreshes lazily on a 401 from any
API call, not on a timer.

### Registration flow changes

`RegisterForm.tsx` gains an institution **combobox** (searchable, ~60 options —
a plain `<select>` is unusable at that length) and a **role selector**
(Student / Teacher). Teacher selection reveals a short "why do you need a teacher
account" note field.

On submit:

1. Create the user with `role` as requested, `teacherApprovedAt: null`.
2. `matchInstitutionByEmail()` — on a hit, set `institutionId` from the domain
   (overriding the picker, since evidence beats a claim) and
   `institutionVerifiedAt` at the moment the *email* is verified, not at signup.
3. Send the existing verification email. On verification, if a domain matched,
   set `institutionVerifiedAt`.
4. Teacher signups additionally notify admins (in-app + email) and show a
   "pending approval" banner.

---

## API contracts

| Method | Path | Auth | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/institutions` | public | `?q=&verified=` | `{ items: InstitutionOption[] }` |
| `GET` | `/api/institutions/[slug]` | public | — | Institution profile + top members |
| `POST` | `/api/auth/refresh` | refresh cookie | — | `{ ok }` + new cookies |
| `POST` | `/api/auth/sessions/revoke` | session | `{ sessionId? }` | `{ ok }` — omit id to revoke all others |
| `GET` | `/api/profile/sessions` | session | — | `{ sessions: SessionView[] }` |
| `POST` | `/api/profile/institution` | session | `{ institutionId }` | `{ ok, verified }` — re-runs domain match |
| `GET` | `/api/admin/institutions` | admin | pagination | `{ items, total }` |
| `POST` | `/api/admin/institutions` | admin | `InstitutionInput` | created |
| `PATCH` | `/api/admin/institutions/[id]` | admin | partial | updated |
| `POST` | `/api/admin/institutions/[id]/domains` | admin | `{ domain, roleHint? }` | created |
| `GET` | `/api/admin/teachers/pending` | admin | — | `{ items: PendingTeacher[] }` |
| `POST` | `/api/admin/teachers/[id]/approve` | admin | `{ note? }` | `{ ok }` + audit log + email |
| `POST` | `/api/admin/teachers/[id]/reject` | admin | `{ reason }` | `{ ok }` + audit log + email |
| `POST` | `/api/admin/users/[id]/verify-institution` | admin | — | `{ ok }` |

Every admin mutation writes an `AdminAuditLog` row — the pattern already exists,
extend it rather than inventing a second audit trail.

---

## Frontend surfaces

| Route / component | Work |
|---|---|
| `components/auth/RegisterForm.tsx` | Institution combobox, role selector, teacher note |
| `components/InstitutionPicker.tsx` *(new)* | Searchable combobox, keyboard-navigable, used in register + profile settings |
| `components/NavAuth.tsx` | Role-aware links; "pending approval" pill for unapproved teachers |
| `components/profile/SettingsForm.tsx` | Change institution; active-sessions list with "sign out" per device |
| `app/institutions/page.tsx` *(new)* | Directory of institutions with member/solve counts — SEO surface, and the visible promise of the national board |
| `app/institutions/[slug]/page.tsx` *(new)* | Institution profile: top solvers, recent contests, verified badge |
| `app/admin/institutions/**` *(new)* | CRUD + domain management |
| `app/admin/teachers/page.tsx` *(new)* | Approval queue with note, approve/reject, audit trail |
| `app/u/[id]/page.tsx` | Show institution with a verified badge instead of the enum label |
| `app/leaderboard/page.tsx` | Institution filter replaces the 4-value university filter; add a "verified only" toggle |

The institution directory is worth building properly: it is a public,
crawlable page per university that ranks that university's students. That is both
the SEO play and the thing a CS department head will be shown to explain why
their university should be on this platform.

---

## Testing plan

| Tier | Test |
|---|---|
| Unit | `matchInstitutionByEmail` — longest-suffix wins; unknown domain → null; case and whitespace normalised; `user+tag@diu.edu.bd` handled |
| Unit | `can()` — full matrix of 4 roles × 12 actions × (owner, non-owner); unapproved teacher denied every teacher action |
| Unit | Refresh rotation — reuse of a revoked token revokes the family |
| Integration | Register with `@diu.edu.bd` → verify email → `institutionVerifiedAt` set, institution = DIU regardless of what was picked |
| Integration | Teacher signup → cannot reach `contest:create` → admin approves → can, without re-login |
| Integration | Suspending a user revokes all their sessions; the next request 401s |
| Migration | Against a snapshot with 4 university values and mixed roles: backfill leaves 0 rows failing the reconciliation query; run twice → identical result |
| Integration | Leaderboard with `verifiedOnly` excludes unverified members |

---

## Acceptance criteria

1. Every existing user retains their institution (mapped from the enum) and can
   log in without disruption.
2. A new registration with a recognised institutional email is auto-verified on
   email confirmation, with no admin action.
3. A teacher signup can do nothing teacher-shaped until approved; approval takes
   effect on the next request without a re-login.
4. Adding a new university is an admin form submission, not a deploy.
5. `/institutions` lists 60+ institutions; `/institutions/diu` ranks DIU's
   verified students.
6. A user can see their active sessions and revoke one from another device.
7. The `University` enum and `User.university` no longer exist after `0006`.
8. `authz.ts` is the only module making permission decisions — no inline role
   checks remain in routes.

## Rollback

- **Before `0005`**: revert the code; the expanded schema is harmless.
- **After `0005`/`0006`**: forward-fix only. Ship these two migrations in a
  separate, low-traffic release at least one week after the backfill reconciles
  clean, and take a Neon branch immediately before.

## Risks

| Risk | Mitigation |
|---|---|
| Enum migration locks `User` | `ADD VALUE` is instant; the `TYPE` swap in `0005` takes a brief ACCESS EXCLUSIVE lock — run in a maintenance window, table is small |
| Wrong institution auto-assigned from a shared domain (e.g. a college using gmail) | Only domains an admin explicitly registers participate; `gmail.com` is never a domain row |
| Teacher approval becomes a bottleneck | Approved teachers at a verified institution can vouch for other teachers at the same institution (Phase 6 adds this); admin remains the fallback |
| Users lose access mid-migration due to session changes | Ship session hardening as a separate deploy from the enum contract; existing JWTs remain valid until natural expiry via a grace-period claim check |
| Institution list is wrong or offensive | Seed only from public official lists; `verified: false` by default for admin-created rows |

## Definition of done

- [ ] `Institution` + `InstitutionDomain` live with 60+ seeded rows
- [ ] `University` enum dropped; no references remain
- [ ] `Role` = STUDENT/TEACHER/TA/ADMIN; no `USER` rows
- [ ] Teacher approval workflow live, audited, and emailed
- [ ] Domain-based verification working end-to-end
- [ ] `Session` table with rotation, reuse detection, and revocation
- [ ] `authz.ts` complete and adopted; zero inline role checks in routes
- [ ] `/institutions` and `/institutions/[slug]` shipped
- [ ] Backfill reconciliation returns 0; migration runbook entry added
- [ ] `universities.ts` deleted
