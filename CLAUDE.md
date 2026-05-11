# CLAUDE.md

Use `AGENTS.md` as the source of truth for this repository.

## Quick Context

- Product: mobile-first attendance web app for a secure worksite
- Main user flow: check-in, TBM stages, lunch stages, and check-out
- Admin flow: roster refresh/write, live dashboard, check-in/check-out correction, zone/time settings
- Core integrations: Kakao invite login, Google Sheet roster read/write, Supabase Postgres for app data, Vercel for deployment

## Working Rules

- Read `AGENTS.md`, `CURRENT_STANDARD.md`, and `IMPLEMENTATION_AUDIT.md` before large changes.
- Treat department-specific rules and the multi-event attendance model as current scope.
- Keep time and location decision logic consistent on the server path.
- Keep admin corrections auditable.

If `CLAUDE.md` and `AGENTS.md` diverge, treat `AGENTS.md` as canonical and update this file to match.
