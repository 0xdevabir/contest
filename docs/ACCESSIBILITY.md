# Accessibility

Target: **WCAG 2.1 AA**, verified by automated checks in CI plus a manual
pass before each phase that touches UI. See `docs/phases/PHASE-14-i18n-pwa.md`
D5 for the design rationale.

## What's enforced today

| Area | Mechanism | Where |
|---|---|---|
| Colour contrast | `scripts/check-contrast.ts` — WCAG ratio math against every theme in `src/lib/theme.ts` (body text, muted text, accent-on-button, danger/warn, and the full rating tier ramp against both `bg` and `bgPanel`) | `npm run check:contrast` |
| Reduced motion | `@media (prefers-reduced-motion: reduce)` in `src/app/globals.css` disables confetti, card-pop, seal, and route-progress animations; `SmoothScroll.tsx` checks the same media query before initializing Lenis at all | automatic |
| Verdict announcement | `role="status" aria-live="polite"` region in `ProblemWorkspace.tsx`, updated whenever a judge result lands | automatic |
| Missing translation | `bn.ts` is typed as `Dict` (derived from `en.ts`) — a missing or renamed key is a TypeScript build error; `scripts/check-i18n.ts` additionally catches stray/untranslated keys the type system can't | `npm run check:i18n`, `tsc --noEmit` |

**Not yet enforced in CI** — `axe-core` automated scanning across the 12 key
pages named in the phase's testing plan, and a scripted keyboard-only /
screen-reader walkthrough. Both need an actual test harness decision
(Playwright + `@axe-core/playwright` is the natural fit given `e2e-runner`)
that's out of scope for this pass; the contrast and motion/verdict/i18n
pieces above don't depend on that harness and are done.

## Manual checklist (run before shipping a UI-touching phase)

- [ ] Tab through the page top-to-bottom — every interactive element reachable, visible focus ring, no trap in modals or Monaco
- [ ] Zoom to 200% — no horizontal scroll on the pages you touched
- [ ] `prefers-reduced-motion: reduce` in OS settings — nothing animates that isn't strictly a state change (e.g. a spinner is fine, confetti is not)
- [ ] Screen reader (VoiceOver/NVDA): register → solve a problem → submit → hear the verdict without hunting
- [ ] Forms: trigger a validation error, confirm it's associated via `aria-describedby` and not colour-only
- [ ] A 40+ row table (gradebook, standings) has real `<th>` headers and a caption, and is at least tab-navigable

## Known gaps to close next

- No automated `axe-core` sweep in CI yet (see above).
- Bundle-size budget (D6: student pages ≤180 KB gz JS, Lighthouse ≥90 on
  Slow 4G) isn't gated in CI. Wiring `size-limit` (or a hand-rolled check
  against `.next/static/chunks`) needs an actual production build to
  calibrate against — do that alongside the first real Lighthouse run
  rather than guessing a config now.
- Only the primary nav, the problem workspace's judge panel, and the auth/
  settings surfaces are wired to `src/i18n` today. The mechanical
  literal-to-key extraction across the other ~40 components (D1's file
  manifest) is unfinished — `scripts/check-i18n.ts` only checks the
  dictionary's internal consistency, not whether a given page actually uses
  it.

## Design notes carried from Phase 14

- **Numerals**: Bangla digits (০১২৩...) in narrative prose only, via
  `proseNumber()` in `src/i18n/format.ts`. Code, verdicts, timings, ranks,
  and scores always render Latin digits (`dataNumber()` or plain
  `String(n)`) — a rank of "৩" next to a scoreboard is worse than either
  choice applied consistently. See `format.ts` for the exact split.
- **Motion**: `AcceptedCelebration`, `RouteProgress`, and `SmoothScroll` are
  the three components the phase doc calls out; all three already respect
  `prefers-reduced-motion` as of this pass.
- **Tier colours**: the phase doc named these "the known problem area" —
  three of Solarized's eight tier colours and two themes' primary `accent`
  (used as button text-on-fill) were under the 3:1/4.5:1 AA thresholds
  before this pass; `src/lib/theme.ts` now has the corrected values with the
  contrast math that produced them noted inline.
