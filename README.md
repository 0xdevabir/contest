# Contest Hub

No-login C programming practice platform built from the **20 Sets Exam-Style Problem Bank** (140 problems).

## Features

- Browse 20 sets (Very Easy → Extreme within each set)
- Write C in the browser and submit against sample tests
- Instant verdicts: AC / WA / CE / RE / TLE
- No accounts — progress stays local in the browser

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Requires `clang` or `gcc` on the machine running the server (used by the local judge).

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind
- Monaco editor
- Local process judge (`clang`/`gcc`) for C
