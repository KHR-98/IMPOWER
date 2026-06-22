import "server-only";

import { compareSync, hashSync } from "bcryptjs";
import { randomUUID } from "node:crypto";

import { buildEventStates } from "@/lib/attendance-events";
import { buildCurrentPeriodStats, getCurrentPeriod } from "@/lib/current-period";
import { buildDepartmentAttendanceSettings, buildOperationalSettings } from "@/lib/attendance-schedule";
import { buildActionAvailability, validateAttendanceMutation } from "@/lib/attendance-rules";
import {
  DEPARTMENT_FEATURE_DISABLED_MESSAGE,
  filterActionStatesForDepartment,
  filterEventStatesForDepartment,
  isAttendanceActionAllowedForDepartment,
} from "@/lib/department-feature-policy";
import { decryptInviteToken, encryptInviteToken, generateInviteToken, hashInviteToken } from "@/lib/invite-links";
import { getRosterReasonMessage, isHalfDayReasonCode } from "@/lib/roster-reasons";
import { getKoreaDateKey, getKoreaDateSlashLabel } from "@/lib/time";
import type {
  AppSettings,
  AdminUserListItem,
  AdminUserMutationInput,
  AccuracyCheckResult,
  AttendanceAction,
  AttendanceEventCode,
  AttendanceMutationResult,
  AttendanceRecord,
  Department,
  InviteLinkListItem,
  InviteLinkType,
  InviteRegistrationContext,
  RosterEntry,
  SessionUser,
  UserAccount,
  UserRole,
  UserTodayView,
  Zone,
  ZoneCheckResult,
} from "@/lib/types";

const demoPasswordHash = hashSync("demo1234", 10);
const demoCreatedAt = "2026-05-02T00:00:00.000Z";
const INITIAL_INVITE_LINK_LIMITS: Record<string, number> = {
  memory: 70,
  memory_pcs: 50,
  foundry_pcs: 15,
};
const INITIAL_INVITE_LINK_DURATION_HOURS = 72;
const STANDARD_INVITE_LINK_DURATION_HOURS = 24;
const STANDARD_INVITE_LINK_MAX_USES = 5;

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

function buildExpiresAt(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function isInviteLinkUsable(link: DemoInviteLink): boolean {
  return link.isActive && Date.parse(link.expiresAt) > Date.now() && link.usedCount < link.maxUses;
}

function mapInviteLink(link: DemoInviteLink): InviteLinkListItem {
  const department = getDepartment(link.departmentId);

  return {
    id: link.id,
    label: link.label,
    departmentId: link.departmentId,
    departmentCode: department?.code ?? null,
    departmentName: department?.name ?? null,
    maxUses: link.maxUses,
    usedCount: link.usedCount,
    expiresAt: link.expiresAt,
    isActive: link.isActive,
    linkType: link.linkType,
    createdBy: link.createdBy,
    createdAt: link.createdAt,
    lastUsedAt: link.lastUsedAt,
    token: isInviteLinkUsable(link) ? decryptInviteToken(link.tokenEncrypted) : null,
  };
}

function createDemoInviteLinkRecord(input: {
  department: Department;
  label: string;
  maxUses: number;
  expiresAt: string;
  linkType: InviteLinkType;
  createdBy: string;
}): InviteLinkListItem {
  const token = generateInviteToken(input.department.code);
  const link: DemoInviteLink = {
    id: `invite-${randomUUID()}`,
    tokenHash: hashInviteToken(token),
    tokenEncrypted: encryptInviteToken(token),
    label: input.label,
    departmentId: input.department.id,
    maxUses: input.maxUses,
    usedCount: 0,
    expiresAt: input.expiresAt,
    isActive: true,
    linkType: input.linkType,
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };

  inviteLinks.unshift(link);
  return { ...mapInviteLink(link), token };
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

interface DemoInviteLink {
  id: string;
  tokenHash: string;
  tokenEncrypted: string;
  label: string;
  departmentId: string;
  maxUses: number;
  usedCount: number;
  expiresAt: string;
  isActive: boolean;
  linkType: InviteLinkType;
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
}

const inviteLinks: DemoInviteLink[] = [];

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

export function getInviteRegistrationContext(token: string): InviteRegistrationContext | null {
  const link = inviteLinks.find((entry) => entry.tokenHash === hashInviteToken(token));

  if (!link || !isInviteLinkUsable(link)) {
    return null;
  }

  const department = getDepartment(link.departmentId);
  if (!department?.isActive) {
    return null;
  }

  return {
    departmentId: department.id,
    departmentCode: department.code,
    departmentName: department.name,
    maxUses: link.maxUses,
    usedCount: link.usedCount,
    expiresAt: link.expiresAt,
  };
}

export function getInviteLinks(actor: SessionUser): InviteLinkListItem[] {
  if (actor.role !== "master" && actor.role !== "admin") {
    return [];
  }

  return inviteLinks
    .filter((link) => link.isActive && (actor.role === "master" || link.departmentId === actor.departmentId))
    .slice(0, 50)
    .map(mapInviteLink);
}

export function createInitialInviteLinks(actor: SessionUser): { ok: boolean; message: string; links: InviteLinkListItem[] } {
  if (actor.role !== "master") {
    return { ok: false, message: "초기 가입 링크는 마스터만 생성할 수 있습니다.", links: [] };
  }

  const expiresAt = buildExpiresAt(INITIAL_INVITE_LINK_DURATION_HOURS);
  const links: InviteLinkListItem[] = [];

  for (const [code, maxUses] of Object.entries(INITIAL_INVITE_LINK_LIMITS)) {
    const department = departments.find((entry) => entry.code === code && entry.isActive);
    if (!department) {
      return { ok: false, message: `초기 링크를 만들 부서를 찾을 수 없습니다: ${code}`, links: [] };
    }

    for (const link of inviteLinks) {
      if (link.departmentId === department.id && link.linkType === "initial" && link.isActive) {
        link.isActive = false;
      }
    }

    links.push(createDemoInviteLinkRecord({
      department,
      label: `초기 가입 - ${department.name}`,
      maxUses,
      expiresAt,
      linkType: "initial",
      createdBy: actor.username,
    }));
  }

  return { ok: true, message: "초기 가입 링크를 생성했습니다.", links };
}

export function createInviteLink(
  input: { departmentId: string | null; maxUses: number },
  actor: SessionUser,
): { ok: boolean; message: string; links: InviteLinkListItem[] } {
  if (actor.role !== "master" && actor.role !== "admin") {
    return { ok: false, message: "초대링크 생성 권한이 없습니다.", links: [] };
  }

  const departmentId = actor.role === "admin" ? actor.departmentId : input.departmentId;

  if (!departmentId) {
    return { ok: false, message: "부서를 선택하세요.", links: [] };
  }

  if (input.maxUses < 1 || input.maxUses > STANDARD_INVITE_LINK_MAX_USES) {
    return { ok: false, message: `신규 가입 링크는 최대 ${STANDARD_INVITE_LINK_MAX_USES}명까지 사용할 수 있습니다.`, links: [] };
  }

  const department = getDepartment(departmentId);
  if (!department?.isActive) {
    return { ok: false, message: "선택한 부서를 찾을 수 없습니다.", links: [] };
  }

  const link = createDemoInviteLinkRecord({
    department,
    label: `신규 가입 - ${department.name}`,
    maxUses: input.maxUses,
    expiresAt: buildExpiresAt(STANDARD_INVITE_LINK_DURATION_HOURS),
    linkType: "standard",
    createdBy: actor.username,
  });

  return { ok: true, message: "신규 가입 링크를 생성했습니다.", links: [link] };
}

export function deactivateInviteLink(id: string, actor: SessionUser): { ok: boolean; message: string } {
  if (actor.role !== "master" && actor.role !== "admin") {
    return { ok: false, message: "초대링크 관리 권한이 없습니다." };
  }

  const link = inviteLinks.find((entry) => entry.id === id && (actor.role === "master" || entry.departmentId === actor.departmentId));
  if (!link) {
    return { ok: false, message: "초대링크를 찾을 수 없습니다." };
  }

  link.isActive = false;
  if (link.isActive) {
    return { ok: false, message: "초대링크 폐기 상태를 확인하지 못했습니다." };
  }

  return { ok: true, message: "초대링크를 폐기했습니다." };
}

export function registerKakaoUserWithInvite(kakaoId: string, displayName: string, inviteToken: string): SessionUser {
  const link = inviteLinks.find((entry) => entry.tokenHash === hashInviteToken(inviteToken));

  if (!link || !isInviteLinkUsable(link)) {
    throw new Error("초대링크가 유효하지 않거나 만료되었습니다.");
  }

  const department = getDepartment(link.departmentId);
  if (!department?.isActive) {
    throw new Error("초대링크의 부서를 찾을 수 없습니다.");
  }

  if (users.some((user) => user.username === `kakao_${kakaoId}`)) {
    throw new Error("이미 등록된 카카오 계정입니다.");
  }

  link.usedCount += 1;
  link.lastUsedAt = new Date().toISOString();
  if (link.usedCount >= link.maxUses) {
    link.isActive = false;
  }

  const user = buildUser(`user-kakao-${kakaoId}`, `kakao_${kakaoId}`, displayName, "user", department.id);
  users.push(user);

  return {
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    departmentId: user.departmentId,
    departmentCode: user.departmentCode,
    departmentName: user.departmentName,
  };
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
  const actionStates = [
    buildActionAvailability("check-in", rosterEntry, record, settings),
    buildActionAvailability("tbm", rosterEntry, record, settings),
    buildActionAvailability("lunch-register", rosterEntry, record, settings),
    buildActionAvailability("lunch-out", rosterEntry, record, settings),
    buildActionAvailability("lunch-in", rosterEntry, record, settings),
    buildActionAvailability("check-out", rosterEntry, record, settings),
  ];
  const eventStates = buildEventStates({
    shiftType,
    rosterEntry,
    record,
    settings,
  });

  return {
    dateKey: workDate,
    dateLabel: getKoreaDateSlashLabel(),
    user: sessionUser,
    isScheduled: Boolean(rosterEntry?.isScheduled || isHalfDayReasonCode(rosterEntry?.scheduleReasonCode)),
    shiftType,
    currentPeriod,
    record,
    actionStates: filterActionStatesForDepartment(actionStates, sessionUser.departmentCode),
    eventStates: filterEventStatesForDepartment(eventStates, sessionUser.departmentCode),
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
    dateLabel: getKoreaDateSlashLabel(),
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
  zoneId: string;
  zoneCheckResult: ZoneCheckResult;
  accuracyCheckResult: AccuracyCheckResult;
}): AttendanceMutationResult {
  const workDate = getKoreaDateKey();
  const sessionUser = getSessionUser(input.username);

  if (!sessionUser) {
    return {
      ok: false,
      message: "유효한 사용자 세션이 아닙니다.",
    };
  }

  if (!isAttendanceActionAllowedForDepartment(input.action, sessionUser.departmentCode)) {
    return {
      ok: false,
      message: DEPARTMENT_FEATURE_DISABLED_MESSAGE,
    };
  }

  const rosterEntry = getTodayRoster().find((entry) => entry.username === input.username) ?? null;
  const currentRecord = getRecord(workDate, input.username);

  if (currentRecord) {
    const duplicateValidation = validateAttendanceMutation({
      action: input.action,
      zoneId: input.zoneId,
      zoneCheckResult: input.zoneCheckResult,
      accuracyCheckResult: input.accuracyCheckResult,
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
    zoneId: input.zoneId,
    zoneCheckResult: input.zoneCheckResult,
    accuracyCheckResult: input.accuracyCheckResult,
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
    latitude: 0,
    longitude: 0,
    accuracyM: 0,
    zoneId: validation.zoneId,
  };

  applyEventToRecord(nextRecord, validation.eventCode, point);
  nextRecord.updatedAt = new Date().toISOString();

  upsertRecord(nextRecord);

  return {
    ok: true,
    message: validation.message,
    record: nextRecord,
    eventStates: filterEventStatesForDepartment(
      buildEventStates({
        shiftType: rosterEntry?.shiftType ?? "day",
        rosterEntry,
        record: nextRecord,
        settings,
      }),
      sessionUser.departmentCode,
    ),
  };
}

// ── 월별 출결 엑셀 샘플 데이터 ──────────────────────────────────────────────

function simpleHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

const DEMO_EXPORT_USERS = [
  { username: "memory_admin",    display_name: "메모리 부서장",     department_id: "dept-memory" },
  { username: "choi",            display_name: "최유진",            department_id: "dept-memory" },
  { username: "memory_pcs_admin",display_name: "메모리PCS 부서장",  department_id: "dept-memory-pcs" },
  { username: "kim",             display_name: "김민수",            department_id: "dept-memory-pcs" },
  { username: "park",            display_name: "박지훈",            department_id: "dept-memory-pcs" },
  { username: "foundry_pcs_admin",display_name: "파운드리PCS 부서장",department_id: "dept-foundry-pcs" },
  { username: "lee",             display_name: "이서준",            department_id: "dept-foundry-pcs" },
  { username: "han",             display_name: "한지아",            department_id: "dept-foundry-pcs" },
];

const ABSENCE_REASONS = ["leave", "military", "education", "vacation", "family_event"] as const;

export function getDemoMonthlyExportData(
  startDate: string,
  endDate: string,
  departmentId?: string | null,
) {
  const filteredUsers = departmentId
    ? DEMO_EXPORT_USERS.filter((u) => u.department_id === departmentId)
    : DEMO_EXPORT_USERS;

  // 평일(월~금)만 수집
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const workDays: string[] = [];
  for (let d = new Date(sy, sm - 1, sd); d <= new Date(ey, em - 1, ed); d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    workDays.push(`${yyyy}-${mm}-${dd}`);
  }

  const records: AttendanceRecord[] = [];
  const rosters: Record<string, unknown>[] = [];

  for (const dateStr of workDays) {
    for (const user of filteredUsers) {
      const seed = simpleHash(`${dateStr}-${user.username}`);

      // 약 1/10 확률로 결근 사유 부여
      const absenceMod = seed % 10;
      const isScheduled = absenceMod > 0;
      const reasonCode = isScheduled ? null : ABSENCE_REASONS[seed % ABSENCE_REASONS.length];

      rosters.push({
        id: `demo-roster-${dateStr}-${user.username}`,
        work_date: dateStr,
        username: user.username,
        display_name: user.display_name,
        is_scheduled: isScheduled,
        shift_type: "day",
        allow_lunch_out: false,
        source_row_key: reasonCode ? `auto|reason=${reasonCode}` : null,
      });

      if (!isScheduled) continue;

      // 출근 시각: 07:50 ~ 08:19
      const ciTotalMin = 7 * 60 + 50 + (seed % 30);
      const ciH = Math.floor(ciTotalMin / 60);
      const ciM = ciTotalMin % 60;
      const ciStr = `${dateStr}T${String(ciH).padStart(2, "0")}:${String(ciM).padStart(2, "0")}:00+09:00`;

      // 1/8 확률로 퇴근 미체크
      const hasCheckOut = (seed % 8) !== 3;
      let coStr: string | null = null;
      if (hasCheckOut) {
        // 퇴근 시각: 17:50 ~ 18:29
        const coTotalMin = 17 * 60 + 50 + ((seed * 7) % 40);
        const coH = Math.floor(coTotalMin / 60);
        const coM = coTotalMin % 60;
        coStr = `${dateStr}T${String(coH).padStart(2, "0")}:${String(coM).padStart(2, "0")}:00+09:00`;
      }

      const makePoint = (iso: string) => ({
        occurredAt: iso,
        latitude: 37.56652,
        longitude: 126.97802,
        accuracyM: 5 + (seed % 15),
        zoneId: "entry-main",
      });

      records.push({
        id: `demo-rec-${dateStr}-${user.username}`,
        workDate: dateStr,
        username: user.username,
        displayName: user.display_name,
        checkIn: makePoint(ciStr),
        tbm: null,
        tbmMorning: null,
        lunchRegister: null,
        lunchOut: null,
        lunchIn: null,
        tbmAfternoon: null,
        tbmCheckout: null,
        checkOut: coStr ? makePoint(coStr) : null,
        correctedByAdmin: false,
        correctionNote: null,
        updatedAt: ciStr,
      });
    }
  }

  return {
    users: filteredUsers,
    records,
    rosters,
    departments: [
      { id: "dept-memory",      name: "메모리" },
      { id: "dept-memory-pcs",  name: "메모리PCS" },
      { id: "dept-foundry-pcs", name: "파운드리PCS" },
    ],
  };
}
