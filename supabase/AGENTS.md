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
- `users`, `zones`, `roster_entries`, `attendance_records`, `audit_logs`, `app_settings` are the phase-1 core tables.
- Keep one `(work_date, username)` row for roster and attendance records.
- Preserve auditability: corrections must remain traceable through `audit_logs`.
- Schema should match `lib/types.ts` and `lib/supabase-store.ts` mappings.

## ANTI-PATTERNS
- Do not remove uniqueness around daily roster or attendance records without a deliberate domain redesign.
- Do not add write-back dependencies to Google Sheet from the database layer.
- Do not change enum-like text fields (`role`, `type`, `shift_type`) casually; app code depends on them.

## NOTES
- `schema.sql` already models lunch and TBM sub-events separately inside `attendance_records`.
- Any schema change here usually requires matching changes in `lib/supabase-store.ts`, `lib/types.ts`, and admin screens.
