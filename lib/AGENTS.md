# LIB DOMAIN GUIDE

## OVERVIEW
`lib/` owns auth, domain rules, persistence switching, Google Sheet parsing, and Supabase-backed data operations.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| session lifecycle | `auth.ts`, `auth-config.ts`, `session-token.ts` | cookie creation, decode, role guards |
| top-level data facade | `app-data.ts` | switches demo vs Supabase and exposes app-facing APIs |
| attendance validation | `attendance-rules.ts`, `attendance-events.ts` | shared availability and mutation checks |
| time-period logic | `current-period.ts`, `attendance-schedule.ts`, `time.ts` | Korea-time windows and operational labels |
| Supabase persistence | `supabase-store.ts` | main production storage, admin actions, sync flows |
| roster import | `google-sheets.ts` | parses legacy GAS, monthly matrix, simple table |
| demo fallback | `demo-store.ts` | working fallback when infra is absent |
| shared contracts | `types.ts` | cross-layer domain types |

## CONVENTIONS
- `app-data.ts` is the only place that should decide demo vs Supabase.
- Validation helpers return product-facing messages; keep wording useful to UI.
- Normalize names and dates before comparing roster or user data.
- Preserve backward compatibility with legacy GAS roster formats unless scope explicitly changes.
- Keep mapping helpers near storage adapters, not in route handlers.

## ANTI-PATTERNS
- Do not call Supabase directly from components or route handlers when a `lib/` facade already exists.
- Do not duplicate time-window or location rules outside shared helpers.
- Do not make Google Sheet parsing write attendance data back out.
- Do not add side effects to pure mapping helpers.

## HOTSPOTS
- `supabase-store.ts` is large and handles multiple admin workflows; make minimal, verified edits.
- `google-sheets.ts` contains input-normalization edge cases; preserve Korean name/date handling.
- `current-period.ts` and `attendance-rules.ts` jointly shape both user and admin UI states.

## VERIFICATION
- Run `npm run typecheck` after any `lib/` change.
- If storage logic changes, also run `npm run build`.
- If auth, attendance, or roster flows change, run the relevant Playwright smoke tests.
