# attendance-webapp

Secure-worksite attendance web app for check-in, TBM attendance, and check-out.

## What is implemented

- Next.js App Router scaffold with TypeScript
- Mobile-first login page, user dashboard, and admin dashboard
- Shared server-side eligibility rules for `check-in`, `tbm`, and `check-out`
- Optional Supabase persistence layer selected automatically when Supabase env vars are present
- Optional Google Sheet roster sync service for daily roster import
- Admin setting editor for time windows, GPS threshold, and zone management
- Optional Kakao Maps-assisted zone picker for admin workflows
- Demo fallback mode so the app still runs before infrastructure is connected
- Supabase schema and seed SQL drafts

## Current modes

- Demo mode: active when Supabase env vars are missing
  - In-memory persistence
  - Demo accounts are shown on the login page
  - Roster sync is disabled
- Supabase mode: active when `NEXT_PUBLIC_SUPABASE_URL` and either `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` are set
  - Uses standardized tables such as `account_users`, `geo_zones`, `work_rosters`, `attendance_daily_records`, `attendance_events`, `audit_attendance_logs`, and `config_global_settings`
  - Legacy names such as `users` and `attendance_records` remain as compatibility views after the 20260503 migration
  - Admin dashboard can trigger daily roster sync if Google Sheet env vars are also set

## Demo accounts

- Admin: `admin` / `demo1234`
- User: `kim` / `demo1234`

## Environment variables

Copy `.env.example` to `.env.local` and fill the values.

- `SESSION_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY`
- `GOOGLE_SHEET_ID`
- `GOOGLE_SHEET_TAB_NAME`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `NEXT_PUBLIC_KAKAO_MAP_APP_KEY`
- `KAKAO_REST_API_KEY`
- `KAKAO_CLIENT_SECRET`

For `GOOGLE_PRIVATE_KEY`, preserve newline characters by storing it with `\n` escapes in the env file.

`NEXT_PUBLIC_KAKAO_MAP_APP_KEY` is optional. When it is set, the admin page shows a Kakao map so zones can be chosen by search and map click. Without it, manual latitude/longitude input still works.

`KAKAO_REST_API_KEY` is used by the server-side Kakao login redirect. `NEXT_PUBLIC_KAKAO_REST_API_KEY` is still accepted as a legacy fallback.

## Database setup

1. Apply [schema.sql](C:/Users/에순이/OneDrive/바탕%20화면/출퇴근어플/supabase/schema.sql)
2. Apply [seed.sql](C:/Users/에순이/OneDrive/바탕%20화면/출퇴근어플/supabase/seed.sql)
3. Login with `admin / demo1234` and then replace the sample users and coordinates

## Expected Google Sheet formats

The app now supports three roster formats.

1. Legacy GAS format
- If the spreadsheet contains a sheet named `늦조인원`, sync uses that sheet first.
- Expected layout from row 3 onward:
  - `B`: date
  - `C~J`: late-shift names
  - `K`: leave or exempt names separated by spaces
  - `L~M`: lunch-exception names separated by spaces
- Sync result:
  - users in `C~J` become `late`
  - users in `K` become unscheduled
  - lunch buttons default to hidden and can be enabled later in admin
  - all other active app users become scheduled `day`

2. Monthly matrix format
- Used when the spreadsheet contains month tabs such as `3월`, `4월`.
- Expected layout:
  - `A`: 근무불가
  - `B`: 날짜
  - `C`: 요일
  - `D~K`: 이름 목록
  - `L`: 비고
  - `N~O`: 사무 인원
- Sync rule currently implemented:
  - weekday rows: `D~K` are treated as `late`, `A/L/N/O` names are excluded, all other active app users become scheduled `day`
  - weekend or holiday rows: only `D~K` names become scheduled `day`, everyone else becomes unscheduled
  - lunch buttons default to hidden and can be enabled later in admin

3. Simple table fallback
- Used only when neither `늦조인원` nor month tabs are present.
- Minimum header row:
  - `date`
  - `name`
  - `scheduled`
- Optional headers:
  - `shift_type`
  - `allow_lunch_out`

Rows are matched against either `users.username` or `users.display_name`. Use the new Supabase `sb_secret_...` key when possible; fall back to `service_role` only if needed.

## Commands

```bash
npm install
npm run typecheck
npm run lint
npm run build
npm run dev
```

## Next suggested implementation steps

- Replace the cookie-based demo auth with a stricter production session strategy
- Add admin record correction UI and audit log writes
- Connect Google Sheet roster sync with a real service account
- Add Playwright end-to-end coverage for user and admin flows


