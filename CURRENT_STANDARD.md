# IM-ON Current Operating Standard

This document is the current product and implementation standard for IM-ON.
When older planning documents conflict with this file, use this file first.

## Confirmed Operating Decisions

- Login is based on admin-created invite links and Kakao login/registration.
- Google Sheet is the work-roster source and may be read and written for roster operations.
- Location handling is not focused on anti-spoofing. The goal is consistent server-side decision logic.
- `entry` zones mean the designated gate areas.
- Checkout must be possible only near the configured gate/entry zone.
- The current multi-event operating model is required.
- Admin correction is focused on check-in and check-out.
- Excel/export work is postponed and should not drive current implementation decisions.

## Departments

The current department model is accepted as implemented:

| Department code | Department name | Expected feature set |
| --- | --- | --- |
| `memory_pcs` | Memory PCS | Check-in, morning TBM, lunch register, lunch out, lunch in, afternoon TBM, checkout TBM, check-out |
| `memory` | Memory | Check-in and check-out centered flow; lunch/TBM disabled |
| `foundry_pcs` | Foundry PCS | Check-in and check-out centered flow; lunch/TBM disabled |

Department-specific rules are core behavior, not an edge case.

## Roles And Permissions

| Role | Operating meaning | Scope |
| --- | --- | --- |
| `master` | Top-level administrator | Can manage all departments |
| `admin` | Team lead | Can modify only their own department |
| `sub_admin` | Shift/group lead | Can view only their own department |
| `user` | Worker | Can use their own attendance flow |

## Attendance Events

The required event model is:

- Check-in
- Morning TBM
- Lunch register
- Lunch out
- Lunch in
- Afternoon TBM
- Checkout TBM
- Check-out

Some departments intentionally hide lunch/TBM events.

## Time Rules

Current default time windows are accepted for now:

| Window | Default |
| --- | --- |
| Day check-in | `06:00 ~ 08:30` |
| Morning TBM | `06:00 ~ 08:30` |
| Day lunch | `11:40 ~ 13:30` |
| Afternoon TBM | `13:35 ~ 13:45` |
| Checkout TBM | `16:30 ~ 16:45` |
| Day check-out | `16:30 ~ 18:00` |
| Late check-in | `09:00 ~ 11:00` |
| Late lunch | `13:50 ~ 15:40` |
| Late check-out | `19:30 ~ 21:00` |

Admins can edit time windows. User-facing button availability and API mutation validation must use the same effective department settings.

## Location Rules

- Check-in and check-out use `entry` zones.
- TBM events use `tbm` zones.
- Lunch register currently follows the implemented allowed-zone rules.
- The client may read device location, but final action eligibility should be determined consistently by the server-side rule path.
- Coordinates do not need to be stored for the current operating goal unless a later requirement says otherwise.

## Google Sheet Rules

- Google Sheet is the operational roster source.
- Reading from Sheet is required for roster sync.
- Writing to Sheet is allowed for roster-related operations.
- Sheet writes must remain explicit and limited to roster/work-status changes, not attendance event result storage unless a future requirement approves it.

## Correction Rules

- Admin correction is required for operational exceptions.
- Current correction scope is check-in and check-out.
- Corrections must require a reason and preserve audit history.
- Lunch/TBM detailed correction is not a current requirement.

## Testing Goal

End-to-end tests are required because the main risk is broken flow wiring:

- Frontend button state
- API request shape
- Server rule decision
- Persistence result
- Admin visibility

Priority test flows:

- Login/session entry
- Check-in success near an entry zone
- Check-in blocked outside a valid zone
- Bad GPS accuracy blocked
- Check-out blocked before required prior state
- Check-out success near an entry zone
- Duplicate check-in/check-out behavior
- Admin view reflects check-in/check-out state
- Admin check-in/check-out correction reflects in user/admin state

## Deferred

- Excel/export scope and formatting
- Full anti-spoofing or device-trust design
- Broad refactors unrelated to attendance correctness
- Removing archived historical planning references
