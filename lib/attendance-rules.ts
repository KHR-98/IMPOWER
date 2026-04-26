import { findMatchingZone } from "@/lib/geo";
import { isWithinWindow } from "@/lib/time";
import type {
  ActionAvailability,
  AppSettings,
  AttendanceAction,
  AttendanceEventCode,
  AttendanceEventState,
  AttendanceMutationResult,
  AttendanceRecord,
  RosterEntry,
  ShiftAttendanceSettings,
  Zone,
  ZoneType,
} from "@/lib/types";

export const ACTION_LABELS: Record<AttendanceAction, string> = {
  "check-in": "출근",
  tbm: "TBM",
  "lunch-register": "점심 등록",
  "lunch-out": "점심 출문",
  "lunch-in": "점심 입문",
  "check-out": "퇴근",
};

const EVENT_LABELS: Record<AttendanceEventCode, string> = {
  check_in: "출근",
  tbm_morning: "TBM",
  lunch_register: "점심 등록",
  lunch_out: "점심 출문",
  lunch_in: "점심 입문",
  tbm_afternoon: "TBM",
  tbm_checkout: "TBM",
  check_out: "퇴근",
};

const EVENT_ZONE_TYPES: Record<AttendanceEventCode, ZoneType> = {
  check_in: "entry",
  tbm_morning: "tbm",
  lunch_register: "entry",
  lunch_out: "entry",
  lunch_in: "entry",
  tbm_afternoon: "tbm",
  tbm_checkout: "tbm",
  check_out: "entry",
};

const DAY_TBM_CODES: AttendanceEventCode[] = ["tbm_morning", "tbm_afternoon", "tbm_checkout"];

function getShiftSettings(
  settings: AppSettings,
  shiftType: RosterEntry["shiftType"],
): ShiftAttendanceSettings | null {
  const shift = shiftType === "late" ? settings.lateShift : settings.dayShift;

  if (!shift || typeof shift !== "object") {
    return null;
  }

  return shift;
}

function getRecordPoint(record: AttendanceRecord | null, code: AttendanceEventCode) {
  if (!record) {
    return null;
  }

  switch (code) {
    case "check_in":
      return record.checkIn;
    case "tbm_morning":
      return record.tbmMorning;
    case "lunch_register":
      return record.lunchRegister;
    case "lunch_out":
      return record.lunchOut;
    case "lunch_in":
      return record.lunchIn;
    case "tbm_afternoon":
      return record.tbmAfternoon;
    case "tbm_checkout":
      return record.tbmCheckout;
    case "check_out":
      return record.checkOut;
  }
}

function formatWindow(window: { start: string; end: string } | null): string {
  if (!window) {
    return "";
  }

  return `${window.start} ~ ${window.end}`;
}

function isWindowActive(window: { start: string; end: string } | null, now: Date): boolean {
  return window ? isWithinWindow(window.start, window.end, now) : false;
}

function getEventWindow(settings: AppSettings, shiftType: RosterEntry["shiftType"], code: AttendanceEventCode) {
  const shift = getShiftSettings(settings, shiftType);

  if (!shift) {
    return null;
  }

  switch (code) {
    case "check_in":
      return shift.checkInWindow;
    case "tbm_morning":
      return shift.tbmMorningWindow;
    case "lunch_register":
      return shift.lunchOutWindow;
    case "lunch_out":
      return shift.lunchOutWindow;
    case "lunch_in":
      return shift.lunchInWindow;
    case "tbm_afternoon":
      return shift.tbmAfternoonWindow;
    case "tbm_checkout":
      return shift.tbmCheckoutWindow;
    case "check_out":
      return shift.checkOutWindow;
  }
}

function getCompletedReason(code: AttendanceEventCode): string {
  return `${EVENT_LABELS[code]} 기록이 이미 완료되었습니다.`;
}

function buildUnavailableState(code: AttendanceEventCode, reason: string, occurredAt: string | null = null): AttendanceEventState {
  return {
    code,
    label: EVENT_LABELS[code],
    action: mapEventCodeToAction(code),
    zoneType: EVENT_ZONE_TYPES[code],
    implemented: true,
    visible: false,
    available: false,
    reason,
    occurredAt,
  };
}

function buildHiddenPendingState(code: AttendanceEventCode, reason: string): AttendanceEventState {
  return {
    code,
    label: EVENT_LABELS[code],
    action: mapEventCodeToAction(code),
    zoneType: EVENT_ZONE_TYPES[code],
    implemented: true,
    visible: false,
    available: false,
    reason,
    occurredAt: null,
  };
}

function mapEventCodeToAction(code: AttendanceEventCode): AttendanceAction {
  switch (code) {
    case "check_in":
      return "check-in";
    case "lunch_register":
      return "lunch-register";
    case "lunch_out":
      return "lunch-out";
    case "lunch_in":
      return "lunch-in";
    case "check_out":
      return "check-out";
    default:
      return "tbm";
  }
}

export function resolveAttendanceEventCode(
  action: AttendanceAction,
  rosterEntry: RosterEntry | null,
  record: AttendanceRecord | null,
  settings: AppSettings,
  now: Date = new Date(),
): AttendanceEventCode {
  if (!rosterEntry) {
    switch (action) {
      case "check-in":
        return "check_in";
      case "lunch-register":
        return "lunch_register";
      case "lunch-out":
        return "lunch_out";
      case "lunch-in":
        return "lunch_in";
      case "check-out":
        return "check_out";
    }
  }

  if (action !== "tbm") {
    switch (action) {
      case "check-in":
        return "check_in";
      case "lunch-register":
        return "lunch_register";
      case "lunch-out":
        return "lunch_out";
      case "lunch-in":
        return "lunch_in";
      case "check-out":
        return "check_out";
    }
  }

  const shiftType = rosterEntry?.shiftType ?? "day";
  const candidates = shiftType === "late" ? ([] as AttendanceEventCode[]) : DAY_TBM_CODES;

  for (const code of candidates) {
    if (!getRecordPoint(record, code) && isWindowActive(getEventWindow(settings, shiftType, code), now)) {
      return code;
    }
  }

  return candidates.find((code) => !getRecordPoint(record, code)) ?? "tbm_morning";
}

export function buildEventAvailability(
  code: AttendanceEventCode,
  rosterEntry: RosterEntry | null,
  record: AttendanceRecord | null,
  settings: AppSettings,
  now: Date = new Date(),
): AttendanceEventState {
  const occurredAt = getRecordPoint(record, code)?.occurredAt ?? null;
  const action = mapEventCodeToAction(code);
  const label = EVENT_LABELS[code];

  if (!rosterEntry?.isScheduled) {
    return buildUnavailableState(code, rosterEntry?.scheduleReason ?? "오늘 근무 대상자가 아닙니다.", occurredAt);
  }

  if (rosterEntry.shiftType === "late" && (code === "tbm_morning" || code === "tbm_afternoon" || code === "tbm_checkout")) {
    return buildUnavailableState(code, "늦조는 TBM 버튼을 사용하지 않습니다.", occurredAt);
  }

  if ((code === "lunch_register" || code === "lunch_out" || code === "lunch_in") && !rosterEntry.allowLunchOut) {
    return buildUnavailableState(code, "점심 출입 대상자로 등록된 경우에만 사용할 수 있습니다.", occurredAt);
  }

  if (occurredAt) {
    return buildUnavailableState(code, getCompletedReason(code), occurredAt);
  }

  if (code !== "check_in" && !record?.checkIn) {
    return buildHiddenPendingState(code, "출근 처리 후 이용할 수 있습니다.");
  }

  if (code === "lunch_out" && !record?.lunchRegister) {
    return buildHiddenPendingState(code, "점심 등록 후 점심 출문을 기록할 수 있습니다.");
  }

  if (code === "lunch_in" && !record?.lunchOut) {
    return buildHiddenPendingState(code, "점심 출문 기록 후 점심 입문을 기록할 수 있습니다.");
  }

  const window = getEventWindow(settings, rosterEntry.shiftType, code);
  const windowText = formatWindow(window);

  if (!window) {
    return buildUnavailableState(code, `${label} 시간이 아직 설정되지 않았습니다.`, occurredAt);
  }

  if (!isWindowActive(window, now)) {
    return buildHiddenPendingState(code, `${label} 가능 시간이 아닙니다.`);
  }

  return {
    code,
    label,
    action,
    zoneType: EVENT_ZONE_TYPES[code],
    implemented: true,
    visible: true,
    available: true,
    reason: "현장 위치를 확인한 뒤 기록합니다.",
    occurredAt,
  };
}

export function buildActionAvailability(
  action: AttendanceAction,
  rosterEntry: RosterEntry | null,
  record: AttendanceRecord | null,
  settings: AppSettings,
  now: Date = new Date(),
): ActionAvailability {
  const code = resolveAttendanceEventCode(action, rosterEntry, record, settings, now);
  const state = buildEventAvailability(code, rosterEntry, record, settings, now);

  return {
    action,
    label: ACTION_LABELS[action],
    available: state.available,
    reason: state.reason,
  };
}

export function validateAttendanceMutation(input: {
  action: AttendanceAction;
  latitude: number;
  longitude: number;
  accuracyM: number;
  rosterEntry: RosterEntry | null;
  record: AttendanceRecord | null;
  zones: Zone[];
  settings: AppSettings;
  now?: Date;
}): AttendanceMutationResult & { zoneId?: string; eventCode?: AttendanceEventCode } {
  const now = input.now ?? new Date();
  const eventCode = resolveAttendanceEventCode(input.action, input.rosterEntry, input.record, input.settings, now);
  const state = buildEventAvailability(eventCode, input.rosterEntry, input.record, input.settings, now);

  if (!state.available) {
    return {
      ok: false,
      message: state.reason,
      eventCode,
    };
  }

  if (input.accuracyM > input.settings.maxGpsAccuracyM) {
    return {
      ok: false,
      message: "GPS 정확도가 낮습니다. 다시 시도하세요.",
      eventCode,
    };
  }

  const zone = findMatchingZone(input.zones, state.zoneType, input.latitude, input.longitude);

  if (!zone) {
    return {
      ok: false,
      message: state.zoneType === "tbm" ? "TBM 집합 위치 안에서만 가능합니다." : "출입 반경 밖입니다. 사업장 내로 이동해주세요.",
      eventCode,
    };
  }

  return {
    ok: true,
    message: `${state.label} 기록이 저장되었습니다.`,
    eventCode,
    zoneId: zone.id,
  };
}

export function isAttendanceAction(value: string): value is AttendanceAction {
  return (
    value === "check-in" ||
    value === "tbm" ||
    value === "lunch-register" ||
    value === "lunch-out" ||
    value === "lunch-in" ||
    value === "check-out"
  );
}
