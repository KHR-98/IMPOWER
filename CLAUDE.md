# CLAUDE.md

Use `AGENTS.md` as the source of truth for this repository.

## Quick Context

- Product: mobile-first attendance web app for a secure worksite
- Main user flow: `check-in`, `tbm`, `check-out`
- Admin flow: roster refresh, live dashboard, record correction, zone/time settings
- Core integrations: Google Sheet for read-only roster sync, Supabase Postgres for app data, Vercel for deployment

## Working Rules

- Read `AGENTS.md` and `app-development-plan.md` before large changes.
- Keep phase 1 focused on one site, multiple entry zones, one TBM zone, and common time settings.
- Keep time and location validation on the server.
- Keep admin corrections auditable.

If `CLAUDE.md` and `AGENTS.md` diverge, treat `AGENTS.md` as canonical and update this file to match.
