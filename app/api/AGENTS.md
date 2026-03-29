# API DOMAIN GUIDE

## OVERVIEW
`app/api/` exposes thin route handlers for user attendance, user-today data, and admin operations.

## STRUCTURE
```text
app/api/
├── attendance/[action]/route.ts
├── me/today/route.ts
└── admin/**/route.ts
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| attendance mutation | `attendance/[action]/route.ts` | parses coordinates, validates session, delegates to `performAttendanceAction` |
| user today snapshot | `me/today/route.ts` | authenticated read of current user state |
| admin dashboard | `admin/dashboard/route.ts` | admin-only dashboard data |
| roster sync | `admin/roster-sync/route.ts` | preview + sync endpoints |
| roster overrides | `admin/roster-controls/route.ts` | daily roster control writes |
| record correction | `admin/attendance-correction/route.ts` | audit-sensitive correction flow |
| settings | `admin/settings/route.ts` | validates zones + GPS settings |
| admin users | `admin/users/route.ts`, `admin/users/import/route.ts` | account management and imports |

## CONVENTIONS
- Route handlers authenticate first, parse input second, delegate third.
- Use `zod` schemas at the route boundary.
- Return product-facing Korean error messages from API responses.
- Admin routes must fail closed on missing or non-admin sessions.

## ANTI-PATTERNS
- Do not embed core business logic in `route.ts` files.
- Do not bypass `lib/auth.ts` for role checks.
- Do not read raw request payloads multiple times.
- Do not let admin endpoints mutate data without validation or audit-safe downstream calls.

## NOTES
- `admin/settings/route.ts` intentionally rebuilds operational defaults and only lets GPS/zones vary in phase 1.
- Attendance endpoints are user-session scoped; never trust a username passed from the client.
