# Phase 14 — Localization, Accessibility & PWA

> **Execute with**: "execute Phase 14"
> **Effort**: 8–12 days · **Flag**: `i18n`, `pwa`
> **Depends on**: Phase 6 (content to translate) · **Unblocks**: reach

---

## Goal

Make the platform usable by a first-year student from a Bangla-medium
background, on a mid-range Android phone, on a 3G connection, in a lab with
unreliable wifi — and by a student using a screen reader.

## Why now

The feature surface is stable, so translated strings will not churn. And this is
the phase that unlocks a population Codeforces structurally cannot serve: the
student whose English is the barrier, not the algorithms.

## Scope

- Bangla UI (bn) alongside English (en)
- Bilingual problem statements
- Bangla-aware typography, numerals and dates
- WCAG 2.1 AA accessibility pass
- Full PWA: installable, offline-capable, push
- Lab kiosk mode: offline statement cache + queued submissions
- 3G performance pass

---

## Design decisions

### D1 — A key-based dictionary, not a framework

Two locales, ~800 strings. `next-intl` or `react-i18next` bring routing
complexity, bundle weight and a build-time pipeline for something a typed
dictionary does better.

```
src/i18n/
  index.ts        # getDictionary(locale), t() helper, typed keys
  en.ts           # source of truth
  bn.ts           # translations
  format.ts       # numbers, dates, relative time, pluralisation
```

```ts
export const en = {
  nav: { problems: "Problems", contests: "Contests", leaderboard: "Leaderboard" },
  judge: { verdict: { AC: "Accepted", WA: "Wrong Answer", TLE: "Time Limit Exceeded" } },
  contest: { startsIn: "Starts in {time}", solved: "{count, plural, one {# solved} other {# solved}}" },
} as const;

export type Dict = typeof en;
export const bn: Dict = { /* same shape, enforced by the type */ };
```

Typing `bn` as `Dict` means a missing translation is a **compile error**, which is
the entire discipline problem of i18n solved by the type checker. A CI check also
flags keys present in `bn` but absent from `en` (stale translations).

Locale resolution: `User.locale` → `Accept-Language` → `en`. Persisted on the
user, applied server-side so the RSC payload is already translated (no flash of
English, no client-side hydration cost).

No locale-prefixed routes. URLs stay stable; locale is a user preference. This
loses per-locale SEO for UI chrome — acceptable, because the SEO value is in
problem statements, which get proper bilingual handling below.

### D2 — Statements are bilingual content, not translated strings

`ProblemVersion.statementBn` already exists from Phase 2. A problem may have:

- English only (the 700-problem bank, initially)
- Bangla only (authored by a Bangla-medium teacher)
- Both

The problem page shows the viewer's preferred language when available, with a
one-click toggle when both exist, and a clear "available in English only" note
otherwise. Never machine-translate a statement silently — a mistranslated
constraint produces wrong answers and destroys trust in the judge. Phase 15 can
*draft* a translation for a human to approve; it must never publish one.

For SEO, a problem with both statements renders `<link rel="alternate" hreflang>`
pairs and serves the Bangla version at `/bn/problems/[slug]`. This is the one
place a locale-prefixed route earns its keep.

### D3 — Bangla typography is not free

| Concern | Handling |
|---|---|
| Font | Noto Sans Bengali, self-hosted, subset, `font-display: swap`. The system font on many Android devices renders Bangla conjuncts poorly. |
| Line height | Bangla needs ~1.7 vs 1.5 for Latin; set per-locale on `<html lang>` |
| Numerals | Bangla numerals (০১২৩) in prose; **Latin numerals in code, verdicts, timings, ranks and scores** — a rank of "৩" is confusing next to a scoreboard, and a time limit must be unambiguous |
| Dates | `Intl.DateTimeFormat("bn-BD")`, `Asia/Dhaka` |
| Mixed content | Code and identifiers stay LTR Latin inside Bangla prose; no `dir` switching needed (Bangla is LTR) |
| Truncation | Bangla strings run 20–40% longer than English; audit every fixed-width UI element |

The numerals rule is a real judgement call and worth writing down: Bangla
numerals in *narrative* text, Latin numerals in *data*. Mixing them in a table is
worse than either choice consistently applied.

### D4 — PWA that is genuinely useful offline, not a checkbox

The offline story that matters for this audience is a university lab with wifi
that drops for thirty seconds at a time during a quiz.

Service worker strategy:

| Resource | Strategy |
|---|---|
| App shell, JS, CSS | Precache, cache-first, versioned |
| Problem statements | Stale-while-revalidate; explicitly pre-cached for an active contest or assignment |
| The code editor (Monaco) | Precached — it is the largest asset and the one whose absence blocks work |
| Submissions | **Background Sync**: a submission made offline is queued in IndexedDB and sent on reconnect, with clear UI state |
| API reads | Network-first with a cache fallback and a visible "showing cached data" indicator |
| Standings | Network only — stale standings are worse than none |

The offline submission queue needs care: a student must know their submission is
queued, not judged, and the queue must survive a page reload. Show a persistent
badge with the queued count and an explicit "sent" transition.

**Draft persistence** is separate and equally important: the editor autosaves to
IndexedDB every few seconds per `(problemId, language)`. A student whose browser
crashes 40 minutes into a lab exam must not lose their code. This is arguably the
single highest-value item in this phase and costs half a day.

Push notifications reuse the Phase 11 subscriptions.

### D5 — Accessibility to WCAG 2.1 AA

Not a nice-to-have: a public university platform will eventually be required to
meet this, and the work is far cheaper done once across a stable surface than
retrofitted per screen.

| Area | Work |
|---|---|
| Contrast | Audit all theme tokens (`src/lib/theme.ts` defines several themes) for 4.5:1 body / 3:1 large. Rating tier colours are the known problem area. |
| Keyboard | Every interactive element reachable and operable; visible focus rings; skip-to-content; no keyboard traps in Monaco or modals |
| Screen readers | Landmarks, headings in order, labelled form controls, `aria-live` for verdicts and standings updates, meaningful alt text |
| Motion | Respect `prefers-reduced-motion` — the Lenis smooth scroll, `RouteProgress` and `AcceptedCelebration` all animate and must degrade |
| Forms | Errors associated with inputs via `aria-describedby`, announced, not colour-only |
| Tables | Scoreboards and gradebooks need proper headers and captions; a 40-column gradebook needs a documented screen-reader path |
| Zoom | Usable at 200% without horizontal scroll |

Verdict announcements via `aria-live="polite"` are the standout: a blind student
submitting code needs to hear "Accepted" without hunting for it.

### D6 — 3G performance

| Target | Approach |
|---|---|
| Student pages ≤ 180 KB gz JS | Monaco loaded only on the workspace route; `next/dynamic` for the heatmap, charts, terminal |
| LCP ≤ 2.5 s on Slow 4G | Server-rendered content, no client fetch on first paint, preconnect to the blob origin |
| Fonts | Subset Bangla + Latin; `font-display: swap`; preload the two used weights only |
| Images | AVIF/WebP via `next/image`; statement images resized on upload |
| Bundle CI check | `size-limit` in CI failing the build on regression |

---

## Schema

```prisma
model User {
  // ...existing
  locale   String @default("en")     // "en" | "bn"
  timezone String @default("Asia/Dhaka")
}

model ProblemVersion {
  // statementBn already added in Phase 2
  titleBn      String?
  inputSpecBn  String?
  outputSpecBn String?
  constraintsBn String?
  /// Who approved the Bangla version — never auto-published.
  bnApprovedById String?
  bnApprovedAt   DateTime?
}
```

Migration `0022_i18n`: additive.

---

## File manifest

### Create

`src/i18n/{index,en,bn,format}.ts`, `src/components/LocaleToggle.tsx`,
`src/components/OfflineIndicator.tsx`, `src/lib/offline/{queue,drafts}.ts`,
`public/sw.js` (or `next-pwa` configuration), `scripts/check-i18n.ts` (key
parity + unused key detection), `scripts/check-contrast.ts` (theme token audit),
`docs/ACCESSIBILITY.md`.

### Modify

Every component with user-facing copy (~45 files) — mechanical: extract literals
to keys. `src/lib/theme.ts` (contrast-corrected tokens). `src/app/layout.tsx`
(`lang`, locale-aware font stack, dictionary provider).
`src/components/CodeEditor.tsx` (draft autosave, offline queue).
`src/components/ProblemWorkspace.tsx` (`aria-live` verdicts, offline state).
`src/app/manifest.ts` (complete PWA manifest: icons, shortcuts, screenshots).
`next.config.ts` (service worker, bundle analysis).

---

## Testing plan

| Tier | Test |
|---|---|
| Static | `check-i18n` — `bn` has every `en` key (type-enforced) and no extras |
| Unit | Number formatting: Bangla numerals in prose, Latin in data contexts |
| Unit | Date formatting in `Asia/Dhaka` for both locales |
| Unit | Offline queue: persists across reload, flushes in order on reconnect, no duplicates |
| Unit | Draft autosave and restore per problem and language |
| a11y | `axe-core` in CI on 12 key pages, zero critical/serious violations |
| a11y | Contrast audit passes for every theme × both locales |
| Manual | Screen-reader walkthrough: register → solve → submit → read verdict |
| Manual | Keyboard-only walkthrough of the same path |
| Integration | Locale preference persists and renders server-side with no English flash |
| Perf | Lighthouse ≥ 90 performance / ≥ 95 accessibility / PWA installable, on throttled Slow 4G |
| Manual | Airplane-mode test: open a cached problem, write code, submit, reconnect, verify it judges |

---

## Acceptance criteria

1. Every student-facing screen is fully translated to Bangla, verified by a
   native reader — not by a machine and not by the developer.
2. A missing translation cannot ship: it is a TypeScript error.
3. Bangla renders with correct conjuncts and line height on a mid-range Android
   device.
4. A bilingual problem toggles languages in one click; an English-only problem
   says so plainly.
5. The app installs as a PWA and opens offline to cached problems.
6. Code written offline is queued, clearly marked as queued, and submits
   automatically on reconnect.
7. An editor draft survives a browser crash.
8. `axe-core` reports zero critical or serious violations on 12 key pages.
9. A verdict is announced to a screen reader without the user hunting for it.
10. Student pages ship under 180 KB gzipped JS; Lighthouse ≥ 90 on Slow 4G.

## Rollback

`i18n` off forces English. `pwa` off unregisters the service worker — include an
explicit unregister path, since a stale service worker is one of the harder
production problems to undo.

## Risks

| Risk | Mitigation |
|---|---|
| Machine translation quality | All Bangla strings reviewed by a native speaker; technical terms (verdicts, algorithm names) deliberately kept in English where that is the community usage |
| Bangla text overflows UI | Audit at 1.4× string length; no fixed-width containers for translated text |
| Service worker serves stale code after a deploy | Versioned precache, `skipWaiting` with an "update available — reload" prompt, and a documented kill switch |
| Offline submissions lost or duplicated | IndexedDB queue with idempotency keys; server dedupes on the key; explicit UI state at every step |
| Accessibility work regresses silently | `axe-core` in CI on every push, not a one-time audit |
| Bangla numerals confuse scoreboards | Documented rule: Bangla in prose, Latin in data; enforced by using `format.ts` helpers rather than raw `toLocaleString` |

## Definition of done

- [ ] Typed bilingual dictionary; missing keys are compile errors
- [ ] All student-facing UI translated and native-reviewed
- [ ] Bilingual statements with toggle and `hreflang` alternates
- [ ] Bangla typography: font, line height, numerals rule, dates
- [ ] WCAG 2.1 AA verified by `axe-core` in CI plus a manual screen-reader pass
- [ ] `prefers-reduced-motion` respected across all animation
- [ ] Installable PWA with offline statements and Monaco precached
- [ ] Offline submission queue with idempotency and clear UI state
- [ ] Editor draft autosave/restore
- [ ] Bundle budget enforced in CI; Lighthouse targets met on Slow 4G
