# CodeHub

The competitive programming platform of **Daffodil International University** — exam-style
C practice plus inter-university contests across 70+ registered Bangladeshi institutions.

## Features

- 700+ exam-style C problems (practice without login), versioned in Postgres
  with tags, difficulty, and a public archive with filters
- Teacher problem authoring: Markdown+LaTeX statements, subtask-grouped test
  data (zip upload or hand-typed), reference solutions, and a publish gate
  that actually compiles and judges a reference solution before a problem can
  go live
- Register / login with an institution profile — searchable across 70+ seeded
  Bangladeshi institutions, with email-domain auto-verification
- STUDENT / TEACHER / TA / ADMIN roles; teacher signups need admin approval
  before they can create contests or problems, and authored problems go
  through a setter review queue before publish
- Email verification + forgot password (SMTP)
- Revocable sessions with refresh-token rotation and reuse detection
- Per-institution practice & contest leaderboards, plus a public `/institutions`
  directory
- Advanced admin command center with analytics, system health, and audit history
- Contest control center: scheduling, rules, problem ordering, go-live, and monitoring
- User access management and complete judge submission inspection
- Logged-in solves persist to Neon Postgres

## Setup

1. Copy env template:

```bash
cp .env.example .env
```

2. Fill in:

- `DATABASE_URL` — Neon Postgres connection string (pooled)
- `DIRECT_URL` — same database, non-pooled connection (required for migrations;
  point it at the same URL as `DATABASE_URL` for a non-pooled Postgres setup)
- `AUTH_SECRET` — `openssl rand -base64 32`
- `APP_URL` — e.g. `http://localhost:3000`
- SMTP vars for mail

3. Apply migrations, then seed institutions + admin:

```bash
npm install
npm run db:deploy
npm run db:seed
```

Set `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD` (minimum 12 characters)
in `.env` before running the seed. No default administrator password is used.
The seed also loads ~70 Bangladeshi institutions from
`prisma/seeds/institutions.ts` — safe to re-run, it only inserts what's missing.

4. Run:

```bash
npm run dev
```

Requires `clang` or `gcc` for the local C judge.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run db:migrate` | Create + apply a new migration (interactive, local dev) |
| `npm run db:deploy` | Apply pending migrations (non-interactive, CI/prod) |
| `npm run db:seed` | Seed institutions + create/update the admin user |
| `npm run db:studio` | Browse data |
| `npm run build` | Generate Prisma client + Next build |

`npm run db:push:danger` (raw `prisma db push`) is for throwaway local
experiments only — it bypasses migration history and should never be run
against an environment anyone else depends on. See `docs/RUNBOOK.md` if
`prisma migrate status` ever reports drift.

## Repo

https://github.com/0xdevabir/contest


