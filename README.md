# Contest Hub

C practice platform + university contests for **DIU**, **NSU**, **AIUB**, and **BRAC**.

## Features

- 140 exam-style C problems (practice without login)
- Register / login with university profile
- Email verification + forgot password (SMTP)
- Per-university practice & contest leaderboards
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

- `DATABASE_URL` — Neon Postgres connection string
- `AUTH_SECRET` — `openssl rand -base64 32`
- `APP_URL` — e.g. `http://localhost:3000`
- SMTP vars for mail

3. Push schema + seed admin:

```bash
npm install
npm run db:push
npm run db:seed
```

Set `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD` (minimum 12 characters)
in `.env` before running the seed. No default administrator password is used.

4. Run:

```bash
npm run dev
```

Requires `clang` or `gcc` for the local C judge.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run db:push` | Sync Prisma schema to Neon |
| `npm run db:seed` | Create / update admin user |
| `npm run db:studio` | Browse data |
| `npm run build` | Generate Prisma client + Next build |

## Repo

https://github.com/0xdevabir/contest

