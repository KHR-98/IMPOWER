# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-24
**Git:** not initialized in this workspace

## OVERVIEW
Mobile-first attendance web app for a secure worksite. Core stack is Next.js App Router + TypeScript + Supabase, with Google Sheet used as a read-only roster source.

## SOURCE OF TRUTH
- Product plan: `app-development-plan.md`
- Redevelopment execution table: `redevelopment-priority-table.md`
- This file defines repository-wide defaults.
- If this file and the plan conflict, stop and confirm before changing behavior.

## STRUCTURE
```text
출퇴근어플/
├── app/           # routes, protected screens, route handlers
├── components/    # client UI, admin panels, map/login widgets
├── lib/           # business rules, auth, data-source switching, integrations
├── supabase/      # schema, seed, migrations
├── tests/         # Playwright e2e smoke coverage
└── app-development-plan.md
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| app entry and redirects | `app/page.tsx`, `app/layout.tsx` | root route sends user to `/login`, `/dashboard`, or `/admin` |
| login flow | `app/login/page.tsx`, `app/login/actions.ts`, `components/login-form.tsx` | server action creates session and redirects by role |
| session handling | `lib/auth.ts`, `lib/auth-config.ts`, `lib/session-token.ts` | secure cookie session, role gates live here |
| data-source switching | `lib/app-data.ts` | single switch between demo and Supabase implementations |
| attendance rules | `lib/attendance-rules.ts`, `lib/attendance-events.ts`, `lib/current-period.ts` | shared eligibility and current-period logic |
| user attendance API | `app/api/attendance/[action]/route.ts` | thin handler, schema parse, delegates to `lib/app-data.ts` |
| admin APIs | `app/api/admin/**/route.ts` | dashboard, roster sync, corrections, settings, users |
| Supabase persistence | `lib/supabase-store.ts`, `supabase/schema.sql` | main production data path |
| Google Sheet parsing | `lib/google-sheets.ts` | legacy GAS / matrix / simple-table roster ingestion |
| e2e smoke tests | `tests/e2e/*.spec.ts`, `playwright.config.ts` | auth/admin and user dashboard smoke coverage |

## CONVENTIONS
- Keep attendance eligibility rules server-side and shared; UI should consume results, not re-implement rules.
- Keep route handlers thin; parse input and delegate to `lib/`.
- Prefer one attendance record per user per work date.
- Time zone is always `Asia/Seoul`; date boundaries are business-critical.
- Google Sheet is an input source only in phase 1. Attendance writes stay in app storage.
- ASCII-first files unless Korean text materially improves UX or product meaning.

## DOMAIN BOUNDARIES
- `app/` owns routing, screen composition, and request boundaries.
- `components/` owns client interactivity and admin/user panels, not core validation rules.
- `lib/` owns auth, roster parsing, persistence switching, validation, and domain models.
- `supabase/` owns schema truth for persisted mode.
- `tests/` owns browser-level smoke checks, not unit fixtures or business logic.

## ANTI-PATTERNS (THIS PROJECT)
- Do not put business rules directly in route handlers.
- Do not fork attendance validation between client and server.
- Do not write attendance results back to Google Sheet in phase 1.
- Do not add multi-site, department-specific, or arbitrary new shift systems without explicit scope change.
- Do not replace custom credentials auth with email/social auth unless explicitly requested.

## UNIQUE STYLES
- The product is modeled after an earlier GAS app: operational simplicity matters more than abstract purity.
- Admin UX is split by task group (`overview`, `users`, `operations`, `accounts`, `system`) instead of one long console.
- Settings UI currently treats time windows as fixed operational defaults; GPS and zone management are the editable focus.
- Demo mode is first-class and should stay runnable when infra is incomplete.
- Current code already models lunch and multiple TBM sub-events beyond the original 3-action phase-1 plan; treat that as current implementation reality and confirm scope before expanding it further.
- Redevelopment should preserve the original GAS app's purpose and operator experience while redesigning storage, validation, and concurrency behavior for stable multi-user operation.

## MCP DEFAULTS
- Use OpenAI docs MCP for OpenAI API / Codex / official docs work.
- Use Playwright MCP when touching login, attendance buttons, geolocation, responsive layout, or admin flows.
- Use Supabase MCP in development scope and read-only by default.
- Use Vercel MCP for deployment/log inspection after the project is connected.

## COMMANDS
```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:ui
```

## NOTES
- `playwright.config.ts` starts the Next dev server automatically on `127.0.0.1:3000` by default.
- `lib/supabase-store.ts` and `lib/google-sheets.ts` are the largest hotspots; read them before changing persistence or roster logic.
- For meaningful changes, report: what changed, what was verified, and any remaining assumptions.
