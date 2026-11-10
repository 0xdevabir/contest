# Security Policy

CodeHub executes untrusted code, so we take security reports seriously.

## Supported versions

Only the latest commit on `main` receives security fixes.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report vulnerabilities privately through
[GitHub Security Advisories](https://github.com/0xdevabir/contest/security/advisories/new).
Include:

- A description of the issue and its impact
- Steps to reproduce or a proof of concept
- Affected components (e.g. `runner/` sandbox, auth, API)

You can expect an initial response within a few days. Once the issue is
confirmed, we'll work on a fix and coordinate disclosure with you.

## Scope

Areas of particular interest:

- Sandbox escapes or resource-limit bypasses in `runner/`
- Authentication, session and authorization flaws
- Leaks of hidden test data, solutions or other users' submissions
- Injection vulnerabilities in the web app or API
