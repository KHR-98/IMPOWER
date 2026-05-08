import type { AttendanceAction } from "@/lib/types";

export const MDM_REQUIRED_ATTENDANCE_ACTIONS: AttendanceAction[] = [
  "check-in",
  "tbm",
  "lunch-register",
  "lunch-in",
  "check-out",
];

export function isMdmRequiredAttendanceAction(action: AttendanceAction): boolean {
  return MDM_REQUIRED_ATTENDANCE_ACTIONS.includes(action);
}
