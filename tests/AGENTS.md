# TESTS DOMAIN GUIDE

## OVERVIEW
`tests/` currently holds Playwright end-to-end smoke coverage for auth, admin access, and user dashboard entry.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| Playwright config | `../playwright.config.ts` | auto-starts dev server and defines chromium project |
| auth/admin smoke | `e2e/auth-admin.spec.ts` | login/session/admin route checks |
| user dashboard smoke | `e2e/user-dashboard.spec.ts` | basic user login and dashboard render |

## CONVENTIONS
- E2E files live under `tests/e2e` and use `*.spec.ts` naming.
- The default runner project is Chromium.
- Local test runs assume the app can boot via `npm run dev` from Playwright webServer.

## ANTI-PATTERNS
- Do not assert implementation details when a user-visible route/state assertion is enough.
- Do not rely on manual pre-start of the dev server unless the config specifically requires it.
- Do not treat smoke coverage as full regression coverage; keep scope explicit.

## NOTES
- Playwright guidance here is repo-scoped; if the runner fails unexpectedly, separate environment/runtime issues from app regressions before changing tests.
- `npm run typecheck` and `npm run build` remain important fallback verification when Playwright is blocked.
