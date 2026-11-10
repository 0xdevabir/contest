# Contributing to CodeHub

Thanks for your interest in improving CodeHub! This guide covers how to get set
up and what we expect from a pull request.

## Getting started

1. Fork the repository and clone your fork.
2. Follow the [Quick start](README.md#quick-start) to install dependencies,
   configure `.env` and set up the database.
3. Create a branch from `main`:

   ```bash
   git checkout -b feat/short-description
   ```

## Before you open a pull request

Run the same checks CI runs:

```bash
npm run verify
```

This runs typecheck, lint, tests, and the i18n and contrast checks. If you touch
`runner/` or `src/lib/judge/`, also run the golden judge tests
(`npm run test:golden`) and include `[judge]` in your PR title so CI runs them too.

## Conventions

- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org):
  `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
- **Schema changes** go through `npm run db:migrate` and follow
  expand → backfill → contract (see `docs/ULTIMATE_PLAN.md`, Appendix G).
  Never use `db:push:danger` for changes you intend to merge.
- **New environment variables** must be added to `.env.example` (with a comment)
  in the same change.
- **New user-facing strings** go in both `src/i18n/en.ts` and `src/i18n/bn.ts`.
- **New features** ship behind a feature flag.
- Add or update tests for any behavior you change.

## Pull requests

- Keep PRs focused — one logical change per PR.
- Describe what changed and why, and link any related issue.
- Include screenshots for UI changes.

## Reporting bugs and requesting features

Open a [GitHub issue](https://github.com/0xdevabir/contest/issues) with steps to
reproduce, expected vs. actual behavior, and your environment. For security
vulnerabilities, see [SECURITY.md](SECURITY.md) instead.

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
