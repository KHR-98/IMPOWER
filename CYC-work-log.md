# CYC Work Log

Generated: 2026-04-28
Project: IMPOWER attendance web app

## Git / Branch Status

- Workspace path: `C:\Users\ycsky\.codex\worktrees\b055\IMPOWER`
- Git repository: yes
- Current workspace state: branch `codex/department-role-settings`
- Current commit: `04da6aa`
- Related main worktree: `C:\Users\ycsky\Desktop\IMPOWER1\CULCHECK\IMPOWER`
- Related main worktree branch: `feat/my-work`

Note: This Codex workspace is now attached to the `codex/department-role-settings` branch. It was fast-forwarded to the latest fetched GitHub commit from `origin/main` on 2026-04-29.

## How To Use This File

Use this file as a running project notebook for changes, issues, fixes, decisions, and operating rules.

Suggested entry format:

```text
Date:
Area:
Changed:
Error / Issue:
Cause:
Fix:
Verified:
Remaining:
```

## Work History

| Date | Area | Change | Verification | Notes |
| --- | --- | --- | --- | --- |
| 2026-04-28 | Project setup | Created this CYC work log file. | File added. | Current Codex worktree is detached HEAD. |
| 2026-04-28 | Planning | Recorded department/role/shift/camera planning summary. | Document updated. | No app functionality changed. |
| 2026-04-29 | Git setup | Created/used `codex/department-role-settings` and fast-forwarded it to GitHub latest `origin/main`. | `HEAD` is `3d64533`. | `CYC-work-log.md` preserved; no app feature edits by Codex yet. |
| 2026-04-29 | Step 1 implementation | Added role foundation for `user`, `department_admin`, and existing `admin`; added department schema/migration seeds for memory PCS, foundry PCS, and memory. | `git diff --check` passed; `npm run typecheck` blocked because `node_modules` is not installed. | Committed as `04da6aa`; no push; no live Supabase migration applied. |
| 2026-04-30 | Step 2 implementation | Added department-specific attendance time settings, admin department buttons, user department selection UI, and user-specific time-rule selection. | `npm run typecheck` passed; `git diff --check` passed. | No live Supabase migration applied yet. |

## Errors / Issues

| Date | Error / Issue | Cause | Resolution | Status |
| --- | --- | --- | --- | --- |
| 2026-04-28 | Git commands initially failed with `dubious ownership`. | Sandbox user differs from the repository file owner. | Re-ran read-only Git checks with a one-time `safe.directory` option. | Resolved for inspection only. |

## Decisions / Rules

- Keep attendance eligibility rules server-side and shared in `lib/`.
- Keep API route handlers thin: parse input, check session, delegate to `lib/`.
- Time zone is business-critical and should remain `Asia/Seoul`.
- Google Sheet is a read-only roster source in this phase; attendance writes stay in app storage.
- Preserve demo mode so the app remains runnable without infrastructure.
- Record meaningful changes with verification notes in this file.

## User Working Preferences

- Before app code changes, discuss the requested change first.
- Provide recommended approach, pros, cons, and web-app limitations before implementation.
- Do not modify app functionality until the user explicitly confirms.
- When implementation is approved, preserve existing behavior as much as possible.
- After implementation, report changed files, before/after behavior, and test method.
- Do not commit or push unless the user confirms after reviewing the changes.

## 2026-04-28 Planning Summary

### Desired Feature Direction

The user wants to extend the current single-department attendance app with the least risky code changes possible.

Planned feature groups:

1. Change roles from two levels to three levels:
   - `user`: regular worker
   - `department_admin`: manager for one department
   - `master`: full administrator for all departments
2. Add department support:
   - departments
   - user-to-department assignment
   - department-specific attendance times
   - department-specific work type handling
3. Keep the main attendance actions:
   - check-in
   - TBM
   - check-out
4. Make attendance button availability depend on:
   - user's department
   - today's roster entry
   - work type such as day/late/weekend if needed
   - department-specific time windows
5. Restrict department admins:
   - can see and edit only their own department
   - cannot see or edit other departments
   - server APIs must enforce this, not only the UI
6. Add camera-access check later:
   - browser can test camera device access with `getUserMedia`
   - browser cannot directly know whether the camera app icon is hidden
   - possible pass condition: camera device not found or camera access unavailable
   - caution: user-denied permission may look similar to policy-denied access in some browsers

### Existing Code Observations

- Existing roles are currently `user` and `admin` in `lib/types.ts`.
- Existing admin checks commonly use `session.role === "admin"`.
- Existing roster flow already uses `roster_entries`.
- Existing work type is already `shiftType: "day" | "late"`.
- Existing Google Sheet sync already parses day/late, leave, half-day, holiday/weekend-like cases.
- Existing attendance rule engine already checks `settings.dayShift` and `settings.lateShift`.
- Existing button validation already lives mostly in `lib/attendance-rules.ts`.

### Minimum-Change Strategy

- Do not rebuild the attendance system.
- Preserve `roster_entries` as the daily source for who works today.
- Preserve `shiftType` as much as possible.
- Start with existing `day` and `late` work types.
- Add `weekend` or more shift types only if weekend hours cannot map to day/late.
- Add department identity to users and roster/dashboard queries.
- Prefer department-specific settings that still produce the existing `AppSettings` shape.
- Let `attendance-rules.ts` keep using the same settings object, but pass department-specific settings into it.

Recommended flow after changes:

```text
user
-> department
-> today's roster entry
-> shiftType
-> department-specific settings
-> existing attendance rule checks
-> button available/unavailable
```

### Google Sheet Direction

Recommended Google Sheet responsibility:

- Keep Google Sheet as the roster/work-type source.
- Store person/date/work type/status in the sheet.
- Keep actual time windows in the app admin settings, not repeated in the sheet.

Example sheet meaning:

```text
day        -> scheduled, shiftType day
late       -> scheduled, shiftType late
leave      -> not scheduled, reason leave
half-day   -> not scheduled or special handling, depending on final policy
weekend    -> initially map to day or late unless separate weekend times are required
```

### Branch / Worktree Reminder

- Main worktree path: `C:\Users\ycsky\Desktop\IMPOWER1\CULCHECK\IMPOWER`
- Main worktree branch: `feat/my-work`
- Current Codex worktree path: `C:\Users\ycsky\.codex\worktrees\b055\IMPOWER`
- Current Codex worktree state: branch `codex/department-role-settings`
- Current Codex worktree commit after GitHub sync: `3d64533`

Important:

- If working directly in the main worktree, work continues on `feat/my-work`.
- If working in this Codex worktree, work continues on `codex/department-role-settings`.
- Before app implementation, confirm the target branch/worktree.
- Do not commit or push until the user confirms.

## TODO / Follow-Up

- Before starting app code changes, confirm the exact 1-step scope with the user.
- Keep `CYC-work-log.md` preserved across branch updates.
- Do not apply Supabase migrations to the live database unless the user explicitly approves.
- Install dependencies before full typecheck/build if the workspace does not have `node_modules`.
- Before Supabase mode testing, apply `supabase/migrations/20260429_add_departments_and_department_admin_role.sql` only after user approval.
