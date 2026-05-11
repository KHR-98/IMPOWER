# IM-ON Implementation Audit

This document tracks current implementation alignment, known risks, and verification priorities.

## Current Alignment Matrix

| Area | Current state | Status | Next verification |
| --- | --- | --- | --- |
| Kakao invite login | Implemented through invite links, Kakao OAuth, pending registration, and session creation | Accepted direction | E2E login/registration smoke |
| Department roles | `master`, `admin`, `sub_admin`, `user` implemented | Accepted direction | Verify scoped admin/sub-admin views |
| Department features | `memory_pcs` full flow, `memory` and `foundry_pcs` lunch/TBM disabled in policy code | Accepted direction | E2E per department button visibility |
| Time settings | Global and department-specific settings exist | Needs verification | Admin edit -> user button/API decision |
| Location rules | Client currently builds zone/accuracy result; API consumes result | Needs cleanup later | Convert to server-side decision path when implementation is approved |
| Attendance events | Multi-event model implemented | Accepted direction | E2E event availability and ordering |
| Admin correction | Check-in/TBM/check-out shape exists; current operating need is check-in/check-out | Needs scope cleanup later | Confirm correction UI matches current standard |
| Google Sheet read | Multiple roster parsers implemented | Needs live env verification | Test against real Sheet format |
| Google Sheet write | Roster-related write functions exist | Accepted direction with limits | Verify writes affect only intended roster cells |
| E2E tests | Present but currently not reliable | Needs fix | Repair cookie/session setup, then expand flows |

## Findings From Code Review

### A1. Demo Mode Does Not Apply Department Settings Consistently

Local development currently runs in demo mode when Supabase env vars are missing.
In demo mode, department time edits are saved into `settings.departmentSettings`, but user availability and mutation validation use global `settings` directly.

Impact:
- A local/admin demo test can show "time edit not reflected" even if the Supabase path would behave differently.
- This can hide or confuse real production issues.

Evidence:
- `lib/app-data.ts` selects demo mode when Supabase env vars are absent.
- `lib/demo-store.ts` uses `settings` directly in user view and mutation validation.
- `lib/supabase-store.ts` applies `applyDepartmentSettings(...)` for user view and attendance mutation.

Status:
- Diagnosed only.
- No code change applied.

### A2. Supabase Time Settings Need Live Verification

Supabase code appears to apply department settings for user view and attendance mutation.
However, local `.env` is absent, so live DB behavior has not been verified.

Status:
- Code path reviewed.
- Runtime verification pending.

### A3. E2E Tests Are Not Yet Reliable

The existing Playwright tests fail before validating the app flow because of cookie setup issues.

Status:
- Diagnosed only.
- E2E repair should precede broader regression testing.

## Verification Priorities

1. Repair E2E test harness.
2. Add focused check-in/check-out tests.
3. Add admin time edit -> user availability test.
4. Add department visibility tests for `memory_pcs`, `memory`, and `foundry_pcs`.
5. Add admin correction test for check-in/check-out.
6. Add Google Sheet sync/write tests only after env and sample Sheet access are available.

## Do Not Treat As Current Problems

- Kakao login replacing name/password login: accepted.
- Google Sheet write capability: accepted for roster operations.
- Detailed Excel/export content: deferred.
- Missing lunch/TBM correction: not required unless the operating standard changes.

## Archive Policy

Historical planning documents are preserved under `archive/project-docs/`.
They are useful context, but they are not current authority when they conflict with `CURRENT_STANDARD.md`.
