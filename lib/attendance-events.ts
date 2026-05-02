import { buildEventAvailability } from "@/lib/attendance-rules";
import type {
  AppSettings,
  AttendanceEventCode,
  AttendanceEventState,
  AttendanceRecord,
  RosterEntry,
  ShiftType,
} from "@/lib/types";

interface EventDefinition {
  code: AttendanceEventCode;
  label: string;
}

const SHIFT_EVENT_DEFINITIONS: Record<ShiftType, EventDefinition[]> = {
  day: [
    { code: "check_in", label: "출근" },
    { code: "tbm_morning", label: "TBM" },
    { code: "lunch_register", label: "점심 등록" },
    { code: "lunch_out", label: "점심 출문" },
    { code: "lunch_in", label: "점심 입문" },
    { code: "tbm_afternoon", label: "TBM" },
    { code: "tbm_checkout", label: "TBM" },
    { code: "check_out", label: "퇴근" },
  ],
  late: [
    { code: "check_in", label: "출근" },
    { code: "lunch_register", label: "점심 등록" },
    { code: "lunch_out", label: "점심 출문" },
    { code: "lunch_in", label: "점심 입문" },
    { code: "check_out", label: "퇴근" },
  ],
  weekend: [
    { code: "check_in", label: "출근" },
    { code: "check_out", label: "퇴근" },
  ],
};

export function getShiftLabel(shiftType: ShiftType): string {
  if (shiftType === "late") {
    return "늦조";
  }

  if (shiftType === "weekend") {
    return "주말근무";
  }

  return "주간조";
}

export function getShiftEventDefinitions(shiftType: ShiftType): EventDefinition[] {
  return SHIFT_EVENT_DEFINITIONS[shiftType];
}

export function buildEventStates(input: {
  shiftType: ShiftType;
  rosterEntry: RosterEntry | null;
  record: AttendanceRecord | null;
  settings: AppSettings;
  now?: Date;
}): AttendanceEventState[] {
  return getShiftEventDefinitions(input.shiftType).map((definition) =>
    buildEventAvailability(definition.code, input.rosterEntry, input.record, input.settings, input.now),
  );
}
