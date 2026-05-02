# SUPABASE DOMAIN GUIDE

## OVERVIEW
`supabase/` defines persisted-mode schema, seed data, and migrations for the attendance app.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| base schema | `schema.sql` | tables, constraints, unique keys |
| starter data | `seed.sql` | development bootstrap |
| incremental changes | `migrations/*.sql` | schema evolution |

## CONVENTIONS
- Canonical table names are grouped by domain prefixes: `org_*`, `account_*`, `geo_*`, `work_*`, `attendance_*`, `audit_*`, and `config_*`.
- Legacy table names such as `users`, `zones`, `roster_entries`, `attendance_records`, `audit_logs`, and `app_settings` are compatibility views after the 20260503 table standardization migration.
- Keep one `(work_date, username)` row for roster and daily attendance records.
- Preserve auditability: corrections must remain traceable through `audit_attendance_logs`.
- New attendance event types should be represented as rows in `attendance_events`, not as more wide columns on `attendance_daily_records`.
- Schema should match `lib/types.ts` and `lib/supabase-store.ts` mappings.

## ANTI-PATTERNS
- Do not remove uniqueness around daily roster or attendance records without a deliberate domain redesign.
- Do not add write-back dependencies to Google Sheet from the database layer.
- Do not change enum-like text fields (`role`, `type`, `shift_type`) casually; app code depends on them.

## NOTES
- `attendance_daily_records` is the daily summary/compatibility table.
- `attendance_events` is the normalized event table for check-in, TBM, lunch, and checkout events.
- Any schema change here usually requires matching changes in `lib/supabase-store.ts`, `lib/types.ts`, and admin screens.
