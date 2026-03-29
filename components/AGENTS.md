# COMPONENTS DOMAIN GUIDE

## OVERVIEW
`components/` holds client-facing UI pieces: login form, attendance action panel, admin panels, and map-assisted zone editors.

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| login form | `login-form.tsx` | server action form, simple credentials UX |
| user action buttons | `attendance-action-panel.tsx` | geolocation read, fetch to attendance API, status message logic |
| admin shell panels | `admin-*.tsx` | task-specific panels for sync, correction, settings, users |
| zone picking UI | `kakao-zone-map.tsx` | map-assisted coordinate selection |

## CONVENTIONS
- Components should consume precomputed domain state from `lib/`, not recreate validation logic.
- Keep user flows mobile-first: large tap targets, short messages, minimal navigation.
- Admin panels are task-oriented; each panel should own one operational job.
- Use router refresh after successful mutations instead of local shadow copies when possible.

## ANTI-PATTERNS
- Do not duplicate attendance eligibility logic in client code.
- Do not hide why a button is disabled; surface a message.
- Do not make forms depend on demo mode unless the runtime explicitly exposes it.
- Do not couple map UI to persistence details.

## NOTES
- `attendance-action-panel.tsx` is the main user interaction hotspot and mixes geolocation, fetch, and status messaging.
- Several admin panels gate edits with `enabled`; preserve that behavior when data source is demo mode.
