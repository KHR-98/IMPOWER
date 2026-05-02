import "server-only";

import { compareSync, hashSync } from "bcryptjs";

import { buildEventStates } from "@/lib/attendance-events";
import { buildCurrentPeriodStats, getCurrentPeriod } from "@/lib/current-period";
import { buildDepartmentAttendanceSettings, buildOperationalSettings } from "@/lib/attendance-schedule";
import { buildActionAvailability, validateAttendanceMutation } from "@/lib/attendance-rules";
import { getRosterReasonMessage } from "@/lib/roster-reasons";
import { getKoreaDateKey, getKoreaDateLabel } from "@/lib/time";
import type {
  AppSettings,
  AdminUserListItem,
  AdminUserMutationInput,
  AttendanceAction,
  AttendanceEventCode,
  AttendanceMutationResult,
  AttendanceRecord,
  Department,
  RosterEntry,
  SessionUser,
  UserAccount,
  UserRole,
  UserTodayView,
  Zone,
} from "@/lib/types";

const demoPasswordHash = hashSync("demo1234", 10);
const demoCreatedAt = "2026-05-02T00:00:00.000Z";

const departments: Department[] = [
  {
    id: "dept-memory",
    code: "memory",
    name: "메모리",
    isActive: true,
  },
  {
    id: "dept-memory-pcs",
    code: "memory_pcs",
    name: "메모리PCS",
    isActive: true,
  },
  {
    id: "dept-foundry-pcs",
    code: "foundry_pcs",
    name: "파운드리PCS",
    isActive: true,
  },
];

function getDepartment(departmentId: string | null): Department | null {
  if (!departmentId) {
    return null;
  }

  return departments.find((department) => department.id === departmentId) ?? null;
}

function buildUser(
  id: string,
  username: string,
  displayName: string,
  role: UserRole,
  departmentId: string,
  isActive: boolean = true,
): UserAccount {
  const department = getDepartment(departmentId);

  return {
    id,
    username,
    displayName,
    role,
    departmentId,
    departmentCode: department?.code ?? null,
    departmentName: department?.name ?? null,
    isActive,
    passwordHash: demoPasswordHash,
  };
}

const users: UserAccount[] = [
  buildUser("user-admin", "admin", "개발자 마스터", "master", "dept-memory-pcs"),
  buildUser("user-memory-admin", "memory_admin", "메모리 부서장", "admin", "dept-memory"),
  buildUser("user-memory-pcs-admin", "memory_pcs_admin", "메모리PCS 부서장", "admin", "dept-memory-pcs"),
  buildUser("user-foundry-pcs-admin", "foundry_pcs_admin", "파운드리PCS 부서장", "admin", "dept-foundry-pcs"),
  buildUser("user-kim", "kim", "김민수", "user", "dept-memory-pcs"),
  buildUser("user-park", "park", "박지훈", "sub_admin", "dept-memory-pcs"),
  buildUser("user-choi", "choi", "최유진", "user", "dept-memory"),
  buildUser("user-lee", "lee", "이서준", "user", "dept-foundry-pcs"),
  buildUser("user-han", "han", "한지아", "sub_admin", "dept-foundry-pcs"),
  buildUser("user-yoon", "yoon", "윤도현", "user", "dept-memory", false),
];

let zones: Zone[] = [
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

function buildDemoSettings(): AppSettings {
  const nextSettings = buildOperationalSettings(100);
  nextSettings.departmentSettings = departments.map((department) => {
    const departmentSettings = buildDepartmentAttendanceSettings(department, nextSettings);

    if (department.code === "memory") {
      departmentSettings.dayShift.checkInWindow = { start: "06:10", end: "08:40" };
      departmentSettings.dayShift.checkOutWindow = { start: "16:40", end: "18:10" };
    }

    if (department.code === "foundry_pcs") {
      departmentSettings.dayShift.checkInWindow = { start: "05:50", end: "08:20" };
      departmentSettings.dayShift.checkOutWindow = { start: "16:20", end: "17:50" };
    }

    return departmentSettings;
  });

  return nextSettings;
}

let settings: AppSettings = buildDemoSettings();

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

function mapAdminUser(user: UserAccount): AdminUserListItem {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    departmentId: user.departmentId,
    departmentCode: user.departmentCode,
    departmentName: user.departmentName,
    isActive: user.isActive,
    createdAt: demoCreatedAt,
  };
}

function canDepartmentAdminManageRole(role: UserRole): boolean {
  return role === "user" || role === "sub_admin";
}

function applyDepartmentToUser(user: UserAccount, departmentId: string) {
  const department = getDepartment(departmentId);

  user.departmentId = departmentId;
  user.departmentCode = department?.code ?? null;
  user.departmentName = department?.name ?? null;
}

export function getDepartments(): Department[] {
  return departments;
}

export function getAdminUsers(departmentId?: string | null): AdminUserListItem[] {
  return users
    .filter((user) => {
      if (departmentId === undefined) {
        return true;
      }

      return departmentId ? user.departmentId === departmentId : false;
    })
    .map(mapAdminUser);
}

export function saveAdminUser(
  input: AdminUserMutationInput,
  actor: SessionUser,
): { ok: boolean; message: string } {
  if (actor.role !== "master" && actor.role !== "admin") {
    return { ok: false, message: "계정 관리 권한이 없습니다." };
  }

  if (!input.departmentId || !getDepartment(input.departmentId)) {
    return { ok: false, message: "부서를 선택하세요." };
  }

  if (actor.role === "admin") {
    if (!actor.departmentId) {
      return { ok: false, message: "소속 부서가 지정되지 않아 계정을 관리할 수 없습니다." };
    }

    if (input.mode === "create") {
      return { ok: false, message: "데모 정책상 부서장은 새 계정을 만들 수 없습니다." };
    }

    if (!canDepartmentAdminManageRole(input.role)) {
      return { ok: false, message: "부서장은 일반 사용자와 부관리자 권한만 지정할 수 있습니다." };
    }
  }

  if (input.mode === "create") {
    if (users.some((user) => user.username === input.username)) {
      return { ok: false, message: "이미 존재하는 아이디입니다." };
    }

    users.push(
      buildUser(
        `user-demo-${input.username}`,
        input.username,
        input.displayName,
        input.role,
        input.departmentId,
        input.isActive,
      ),
    );

    return { ok: true, message: "데모 계정을 생성했습니다." };
  }

  const user = users.find((entry) => entry.username === input.username);

  if (!user) {
    return { ok: false, message: "사용자 정보를 찾을 수 없습니다." };
  }

  if (actor.role === "admin") {
    if (user.departmentId !== actor.departmentId) {
      return { ok: false, message: "소속 부서 사용자만 관리할 수 있습니다." };
    }

    if (!canDepartmentAdminManageRole(user.role)) {
      return { ok: false, message: "관리자 또는 마스터 계정은 수정할 수 없습니다." };
    }
  }

  const lastActiveMaster =
    user.role === "master" &&
    user.isActive &&
    (input.role !== "master" || !input.isActive) &&
    users.filter((entry) => entry.role === "master" && entry.isActive).length <= 1;

  if (lastActiveMaster) {
    return { ok: false, message: "마지막 활성 마스터 계정은 변경할 수 없습니다." };
  }

  user.displayName = input.displayName;
  user.role = input.role;
  user.isActive = input.isActive;
  applyDepartmentToUser(user, input.departmentId);

  return { ok: true, message: "데모 사용자 정보를 저장했습니다." };
}

export function deleteAdminUser(username: string, actor: SessionUser): { ok: boolean; message: string } {
  if (actor.role !== "master" && actor.role !== "admin") {
    return { ok: false, message: "계정 관리 권한이 없습니다." };
  }

  if (actor.username === username) {
    return { ok: false, message: "본인 계정은 비활성화할 수 없습니다." };
  }

  const user = users.find((entry) => entry.username === username);

  if (!user) {
    return { ok: false, message: "사용자 정보를 찾을 수 없습니다." };
  }

  if (actor.role === "admin") {
    if (!actor.departmentId || user.departmentId !== actor.departmentId) {
      return { ok: false, message: "소속 부서 사용자만 비활성화할 수 있습니다." };
    }

    if (!canDepartmentAdminManageRole(user.role)) {
      return { ok: false, message: "관리자 또는 마스터 계정은 비활성화할 수 없습니다." };
    }
  }

  if (user.role === "master" && user.isActive && users.filter((entry) => entry.role === "master" && entry.isActive).length <= 1) {
    return { ok: false, message: "마지막 활성 마스터 계정은 비활성화할 수 없습니다." };
  }

  user.isActive = false;

  return { ok: true, message: "데모 계정을 비활성화했습니다. 출퇴근 기록은 보존됩니다." };
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

export function getDashboardView(departmentId?: string | null) {
  const workDate = getKoreaDateKey();
  const scheduledUsers = getTodayRoster().filter((entry) => {
    if (departmentId === undefined) {
      return true;
    }

    const user = users.find((candidate) => candidate.username === entry.username);
    return departmentId ? user?.departmentId === departmentId : false;
  });
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

export function saveAdminConfiguration(
  input: { settings: AppSettings; zones: Zone[] },
  actorRole: UserRole,
  actorDepartmentId: string | null,
): { ok: boolean; message: string } {
  if (actorRole !== "master" && actorRole !== "admin") {
    return { ok: false, message: "운영 설정을 저장할 권한이 없습니다." };
  }

  if (actorRole === "admin") {
    if (!actorDepartmentId) {
      return { ok: false, message: "소속 부서가 지정되지 않아 운영 설정을 저장할 수 없습니다." };
    }

    const nextDepartmentSetting = input.settings.departmentSettings.find((department) => department.id === actorDepartmentId);

    if (!nextDepartmentSetting) {
      return { ok: false, message: "부서 설정 정보를 찾을 수 없습니다." };
    }

    settings = {
      ...settings,
      departmentSettings: settings.departmentSettings.map((department) =>
        department.id === actorDepartmentId ? nextDepartmentSetting : department,
      ),
    };

    return { ok: true, message: "데모 부서 시간 설정을 저장했습니다." };
  }

  settings = input.settings;
  zones = input.zones;

  return { ok: true, message: "데모 운영 설정을 저장했습니다." };
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
