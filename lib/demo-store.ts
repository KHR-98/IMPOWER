import "server-only";

import { compareSync, hashSync } from "bcryptjs";

import { buildEventStates } from "@/lib/attendance-events";
import { buildCurrentPeriodStats, getCurrentPeriod } from "@/lib/current-period";
import { buildOperationalSettings } from "@/lib/attendance-schedule";
import { buildActionAvailability, validateAttendanceMutation } from "@/lib/attendance-rules";
import { getRosterReasonMessage } from "@/lib/roster-reasons";
import { getKoreaDateKey, getKoreaDateLabel } from "@/lib/time";
import type {
  AppSettings,
  AttendanceAction,
  AttendanceEventCode,
  AttendanceMutationResult,
  AttendanceRecord,
  RosterEntry,
  SessionUser,
  UserAccount,
  UserTodayView,
  Zone,
} from "@/lib/types";

const demoPasswordHash = hashSync("demo1234", 10);

const users: UserAccount[] = [
  {
    id: "user-admin",
    username: "admin",
    displayName: "현장관리자",
    role: "admin",
    departmentId: null,
    departmentCode: null,
    departmentName: null,
    isActive: true,
    passwordHash: demoPasswordHash,
  },
  {
    id: "user-kim",
    username: "kim",
    displayName: "김민수",
    role: "user",
    departmentId: null,
    departmentCode: null,
    departmentName: null,
    isActive: true,
    passwordHash: demoPasswordHash,
  },
  {
    id: "user-park",
    username: "park",
    displayName: "박지훈",
    role: "user",
    departmentId: null,
    departmentCode: null,
    departmentName: null,
    isActive: true,
    passwordHash: demoPasswordHash,
  },
  {
    id: "user-choi",
    username: "choi",
    displayName: "최유진",
    role: "user",
    departmentId: null,
    departmentCode: null,
    departmentName: null,
    isActive: true,
    passwordHash: demoPasswordHash,
  },
  {
    id: "user-lee",
    username: "lee",
    displayName: "이서준",
    role: "user",
    departmentId: null,
    departmentCode: null,
    departmentName: null,
    isActive: true,
    passwordHash: demoPasswordHash,
  },
];

const zones: Zone[] = [
  {
    id: "entry-main",
    name: "정문",
    type: "entry",
    latitude: 37.56652,
    longitude: 126.97802,
    radiusM: 120,
    isActive: true,
  },
  {
    id: "entry-office",
    name: "사무실 입구",
    type: "entry",
    latitude: 37.56618,
    longitude: 126.97775,
    radiusM: 90,
    isActive: true,
  },
  {
    id: "tbm-yard",
    name: "TBM 집합장",
    type: "tbm",
    latitude: 37.56674,
    longitude: 126.97855,
    radiusM: 80,
    isActive: true,
  },
];

let settings: AppSettings = buildOperationalSettings(100);

let attendanceRecords: AttendanceRecord[] = [];

function buildEmptyRecord(workDate: string, username: string, displayName: string): AttendanceRecord {
  return {
    id: `${workDate}-${username}`,
    workDate,
    username,
    displayName,
    checkIn: null,
    tbm: null,
    tbmMorning: null,
    lunchRegister: null,
    lunchOut: null,
    lunchIn: null,
    tbmAfternoon: null,
    tbmCheckout: null,
    checkOut: null,
    correctedByAdmin: false,
    correctionNote: null,
    updatedAt: new Date().toISOString(),
  };
}

function buildTodayRoster(): RosterEntry[] {
  const workDate = getKoreaDateKey();

  return [
    {
      id: `${workDate}-kim`,
      workDate,
      username: "kim",
      displayName: "김민수",
      isScheduled: true,
      shiftType: "day",
      allowLunchOut: true,
    },
    {
      id: `${workDate}-park`,
      workDate,
      username: "park",
      displayName: "박지훈",
      isScheduled: true,
      shiftType: "late",
      allowLunchOut: true,
    },
    {
      id: `${workDate}-choi`,
      workDate,
      username: "choi",
      displayName: "최유진",
      isScheduled: true,
      shiftType: "day",
      allowLunchOut: false,
    },
    {
      id: `${workDate}-lee`,
      workDate,
      username: "lee",
      displayName: "이서준",
      isScheduled: false,
      shiftType: "day",
      allowLunchOut: false,
      scheduleReasonCode: "not_listed",
      scheduleReason: getRosterReasonMessage("not_listed"),
    },
  ];
}

function getTodayRoster(): RosterEntry[] {
  return buildTodayRoster();
}

function getRecord(workDate: string, username: string): AttendanceRecord | null {
  return attendanceRecords.find((record) => record.workDate === workDate && record.username === username) ?? null;
}

function upsertRecord(nextRecord: AttendanceRecord) {
  attendanceRecords = attendanceRecords.filter(
    (record) => !(record.workDate === nextRecord.workDate && record.username === nextRecord.username),
  );
  attendanceRecords.push(nextRecord);
}

function applyEventToRecord(record: AttendanceRecord, eventCode: AttendanceEventCode, point: AttendanceRecord["checkIn"]) {
  if (!point) {
    return;
  }

  switch (eventCode) {
    case "check_in":
      record.checkIn = point;
      break;
    case "tbm_morning":
      record.tbmMorning = point;
      record.tbm = point;
      break;
    case "lunch_register":
      record.lunchRegister = point;
      break;
    case "lunch_out":
      record.lunchOut = point;
      break;
    case "lunch_in":
      record.lunchIn = point;
      break;
    case "tbm_afternoon":
      record.tbmAfternoon = point;
      break;
    case "tbm_checkout":
      record.tbmCheckout = point;
      break;
    case "check_out":
      record.checkOut = point;
      break;
  }
}

function hasRecordedEvent(record: AttendanceRecord | null, eventCode: AttendanceEventCode): boolean {
  if (!record) {
    return false;
  }

  switch (eventCode) {
    case "check_in":
      return Boolean(record.checkIn);
    case "tbm_morning":
      return Boolean(record.tbmMorning ?? record.tbm);
    case "lunch_register":
      return Boolean(record.lunchRegister);
    case "lunch_out":
      return Boolean(record.lunchOut);
    case "lunch_in":
      return Boolean(record.lunchIn);
    case "tbm_afternoon":
      return Boolean(record.tbmAfternoon);
    case "tbm_checkout":
      return Boolean(record.tbmCheckout);
    case "check_out":
      return Boolean(record.checkOut);
  }
}

function buildDuplicateSuccessResult(record: AttendanceRecord, eventCode: AttendanceEventCode): AttendanceMutationResult {
  const label =
    eventCode === "check_in"
      ? "출근"
      : eventCode === "check_out"
        ? "퇴근"
        : eventCode === "lunch_register"
          ? "점심 등록"
          : eventCode === "lunch_out"
            ? "점심 출문"
            : eventCode === "lunch_in"
              ? "점심 입문"
              : "TBM";

  return {
    ok: true,
    message: `${label} 기록이 이미 완료되었습니다.`,
    record,
  };
}

export function getDemoCredentials() {
  return {
    admin: { username: "admin", password: "demo1234" },
    user: { username: "kim", password: "demo1234" },
  };
}

export function authenticateDemoUser(username: string, password: string): SessionUser | null {
  const user = users.find((entry) => entry.username === username && entry.isActive);

  if (!user) {
    return null;
  }

  const valid = compareSync(password, user.passwordHash);

  if (!valid) {
    return null;
  }

  return {
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    departmentId: user.departmentId,
    departmentCode: user.departmentCode,
    departmentName: user.departmentName,
  };
}

export function changeDemoPassword(input: {
  username: string;
  currentPassword: string;
  nextPassword: string;
}): { ok: boolean; message: string } {
  const user = users.find((entry) => entry.username === input.username && entry.isActive);

  if (!user) {
    return {
      ok: false,
      message: "사용자 정보를 찾을 수 없습니다.",
    };
  }

  if (!compareSync(input.currentPassword, user.passwordHash)) {
    return {
      ok: false,
      message: "현재 비밀번호가 올바르지 않습니다.",
    };
  }

  user.passwordHash = hashSync(input.nextPassword, 10);

  return {
    ok: true,
    message: "비밀번호를 변경했습니다. 새 비밀번호로 로그인하세요.",
  };
}

export function getSessionUser(username: string): SessionUser | null {
  const user = users.find((entry) => entry.username === username && entry.isActive);

  if (!user) {
    return null;
  }

  return {
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    departmentId: user.departmentId,
    departmentCode: user.departmentCode,
    departmentName: user.departmentName,
  };
}

export function getUserTodayView(username: string): UserTodayView {
  const sessionUser = getSessionUser(username);

  if (!sessionUser) {
    throw new Error(`Unknown user: ${username}`);
  }

  const workDate = getKoreaDateKey();
  const rosterEntry = getTodayRoster().find((entry) => entry.username === username) ?? null;
  const record = getRecord(workDate, username);
  const shiftType = rosterEntry?.shiftType ?? "day";
  const currentPeriod = getCurrentPeriod(settings);

  return {
    dateKey: workDate,
    dateLabel: getKoreaDateLabel(),
    user: sessionUser,
    isScheduled: rosterEntry?.isScheduled ?? false,
    shiftType,
    currentPeriod,
    record,
    actionStates: [
      buildActionAvailability("check-in", rosterEntry, record, settings),
      buildActionAvailability("tbm", rosterEntry, record, settings),
      buildActionAvailability("lunch-register", rosterEntry, record, settings),
      buildActionAvailability("lunch-out", rosterEntry, record, settings),
      buildActionAvailability("lunch-in", rosterEntry, record, settings),
      buildActionAvailability("check-out", rosterEntry, record, settings),
    ],
    eventStates: buildEventStates({
      shiftType,
      rosterEntry,
      record,
      settings,
    }),
  };
}

export function getDashboardView() {
  const workDate = getKoreaDateKey();
  const scheduledUsers = getTodayRoster();
  const rows = scheduledUsers.map((entry) => getRecord(workDate, entry.username) ?? buildEmptyRecord(workDate, entry.username, entry.displayName));
  const currentPeriod = getCurrentPeriod(settings);

  const scheduledCount = scheduledUsers.filter((entry) => entry.isScheduled).length;
  const checkedInCount = rows.filter((row) => row.checkIn).length;
  const tbmCompleteCount = rows.filter((row) => row.tbm).length;
  const lunchRegisteredCount = rows.filter((row) => row.lunchRegister).length;
  const lunchOutCount = rows.filter((row) => row.lunchOut).length;
  const lunchInCount = rows.filter((row) => row.lunchIn).length;
  const checkedOutCount = rows.filter((row) => row.checkOut).length;

  return {
    dateKey: workDate,
    dateLabel: getKoreaDateLabel(),
    currentPeriod,
    currentPeriodStats: buildCurrentPeriodStats({
      period: currentPeriod,
      scheduledUsers,
      rows,
    }),
    summary: {
      scheduledCount,
      checkedInCount,
      notCheckedInCount: Math.max(scheduledCount - checkedInCount, 0),
      tbmCompleteCount,
      tbmPendingCount: Math.max(scheduledCount - tbmCompleteCount, 0),
      lunchRegisteredCount,
      lunchOutCount,
      lunchInCount,
      checkedOutCount,
      notCheckedOutCount: Math.max(scheduledCount - checkedOutCount, 0),
    },
    rows,
    scheduledUsers,
    zones,
    settings,
  };
}

export function getZones(): Zone[] {
  return zones;
}

export function getSettings(): AppSettings {
  return settings;
}

export function getDevCoordinates(): Partial<Record<AttendanceAction, { latitude: number; longitude: number; accuracyM: number }>> {
  return {
    "check-in": { latitude: zones[0].latitude, longitude: zones[0].longitude, accuracyM: 12 },
    tbm: { latitude: zones[2].latitude, longitude: zones[2].longitude, accuracyM: 10 },
    "lunch-register": { latitude: zones[0].latitude, longitude: zones[0].longitude, accuracyM: 12 },
    "lunch-out": { latitude: zones[0].latitude, longitude: zones[0].longitude, accuracyM: 12 },
    "lunch-in": { latitude: zones[1].latitude, longitude: zones[1].longitude, accuracyM: 12 },
    "check-out": { latitude: zones[1].latitude, longitude: zones[1].longitude, accuracyM: 14 },
  };
}

export function performAttendanceAction(input: {
  username: string;
  action: AttendanceAction;
  latitude: number;
  longitude: number;
  accuracyM: number;
}): AttendanceMutationResult {
  const workDate = getKoreaDateKey();
  const sessionUser = getSessionUser(input.username);

  if (!sessionUser) {
    return {
      ok: false,
      message: "유효한 사용자 세션이 아닙니다.",
    };
  }

  const rosterEntry = getTodayRoster().find((entry) => entry.username === input.username) ?? null;
  const currentRecord = getRecord(workDate, input.username);

  if (currentRecord) {
    const duplicateValidation = validateAttendanceMutation({
      action: input.action,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyM: input.accuracyM,
      rosterEntry,
      record: currentRecord,
      zones,
      settings,
    });

    if (duplicateValidation.eventCode && hasRecordedEvent(currentRecord, duplicateValidation.eventCode)) {
      return buildDuplicateSuccessResult(currentRecord, duplicateValidation.eventCode);
    }
  }

  const validation = validateAttendanceMutation({
    action: input.action,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracyM: input.accuracyM,
    rosterEntry,
    record: currentRecord,
    zones,
    settings,
  });

  if (!validation.ok || !validation.zoneId || !validation.eventCode) {
    return validation;
  }

  const nextRecord = currentRecord ?? buildEmptyRecord(workDate, input.username, sessionUser.displayName);
  const point = {
    occurredAt: new Date().toISOString(),
    latitude: input.latitude,
    longitude: input.longitude,
    accuracyM: input.accuracyM,
    zoneId: validation.zoneId,
  };

  applyEventToRecord(nextRecord, validation.eventCode, point);
  nextRecord.updatedAt = new Date().toISOString();

  upsertRecord(nextRecord);

  return {
    ok: true,
    message: validation.message,
    record: nextRecord,
    eventStates: buildEventStates({
      shiftType: rosterEntry?.shiftType ?? "day",
      rosterEntry,
      record: nextRecord,
      settings,
    }),
  };
}
