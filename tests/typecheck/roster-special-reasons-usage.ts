import {
  getRosterReasonMessage,
  isHalfDayReasonCode,
  parseRosterReasonCodeFromSourceKey,
} from "@/lib/roster-reasons";
import type { RosterReasonCode } from "@/lib/types";

const nonAttendanceReasons: RosterReasonCode[] = [
  "education",
  "family_event",
  "vacation",
];

const messages: string[] = nonAttendanceReasons.map((reasonCode) => getRosterReasonMessage(reasonCode));
const parsedEducationReason: RosterReasonCode | null = parseRosterReasonCodeFromSourceKey("sheet|reason=education");
const parsedFamilyEventReason: RosterReasonCode | null = parseRosterReasonCodeFromSourceKey("sheet|reason=family_event");
const parsedVacationReason: RosterReasonCode | null = parseRosterReasonCodeFromSourceKey("sheet|reason=vacation");
const halfDayFlags: boolean[] = nonAttendanceReasons.map((reasonCode) => isHalfDayReasonCode(reasonCode));

void messages;
void parsedEducationReason;
void parsedFamilyEventReason;
void parsedVacationReason;
void halfDayFlags;
