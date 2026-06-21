import "server-only";

import { randomUUID } from "node:crypto";
import { compareSync, hashSync } from "bcryptjs";

import { buildEventStates } from "@/lib/attendance-events";
import { buildCurrentPeriodStats, getCurrentPeriod } from "@/lib/current-period";
import {
  DEFAULT_WEEKEND_SHIFT_SETTINGS,
  buildDepartmentAttendanceSettings,
  buildOperationalSettings,
  cloneShiftSettings,
} from "@/lib/attendance-schedule";
import { buildActionAvailability, validateAttendanceMutation } from "@/lib/attendance-rules";
import {
  DEPARTMENT_FEATURE_DISABLED_MESSAGE,
  filterActionStatesForDepartment,
  filterEventStatesForDepartment,
  isAttendanceActionAllowedForDepartment,
} from "@/lib/department-feature-policy";
import { fetchSheetRosterSnapshot, fetchSheetUserCandidates } from "@/lib/google-sheets";
import { encodeRosterSourceKey, getRosterReasonMessage, isHalfDayReasonCode, parseRosterReasonCodeFromSourceKey } from "@/lib/roster-reasons";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { getKoreaDateKey, getKoreaDateLabel } from "@/lib/time";
import { decryptInviteToken, encryptInviteToken, generateInviteToken, hashInviteToken } from "@/lib/invite-links";
import type {
  AdminAttendanceCorrectionInput,
  AdminRosterControlInput,
  AdminRosterEntryInput,
  AdminUserImportInput,
  AdminUserListItem,
  AdminUserMutationInput,
  AppSettings,
  AccuracyCheckResult,
  AttendanceAction,
  AttendanceEventCode,
  AttendanceMutationResult,
  AttendancePoint,
  AttendanceRecord,
  DashboardView,
  Department,
  DepartmentAttendanceSettings,
  InviteLinkListItem,
  InviteLinkType,
  InviteRegistrationContext,
  RosterEntry,
  RosterSyncPreview,
  RosterSyncResult,
  RosterSyncUser,
  SessionUser,
  ShiftAttendanceSettings,
  ShiftType,
  SheetUserImportPreview,
  TimeWindow,
  UserTodayView,
  UserRole,
  Zone,
  ZoneCheckResult,
} from "@/lib/types";

const EVENT_STORAGE_PREFIX: Record<AttendanceEventCode, "check_in" | "tbm" | "tbm_morning" | "lunch_register" | "lunch_out" | "lunch_in" | "tbm_afternoon" | "tbm_checkout" | "check_out"> = {
  check_in: "check_in",
  tbm_morning: "tbm_morning",
  lunch_register: "lunch_register",
  lunch_out: "lunch_out",
  lunch_in: "lunch_in",
  tbm_afternoon: "tbm_afternoon",
  tbm_checkout: "tbm_checkout",
  check_out: "check_out",
};

const EVENT_SUCCESS_LABELS: Record<AttendanceEventCode, string> = {
  check_in: "출근",
  tbm_morning: "TBM",
  lunch_register: "점심 등록",
  lunch_out: "점심 출문",
  lunch_in: "점심 입문",
  tbm_afternoon: "TBM",
  tbm_checkout: "TBM",
  check_out: "퇴근",
};

const ATTENDANCE_WINDOW_ACTIONS = new Set<AttendanceEventCode>([
  "check_in",
  "tbm_morning",
  "lunch_register",
  "lunch_out",
  "lunch_in",
  "tbm_afternoon",
  "tbm_checkout",
  "check_out",
]);

const TABLES = {
  departments: "org_departments",
  users: "account_users",
  zones: "geo_zones",
  rosters: "work_rosters",
  attendanceDailyRecords: "attendance_daily_records",
  attendanceEvents: "attendance_events",
  auditAttendanceLogs: "audit_attendance_logs",
  globalSettings: "config_global_settings",
  departmentSettings: "config_department_settings",
  attendanceWindows: "config_attendance_windows",
  inviteLinks: "account_invite_links",
} as const;

const defaultSettings: AppSettings = buildOperationalSettings(100);
const DEFAULT_WEEKEND_LUNCH_OUT_WINDOW = DEFAULT_WEEKEND_SHIFT_SETTINGS.lunchOutWindow ?? { start: "11:30", end: "13:50" };
const DEFAULT_WEEKEND_LUNCH_IN_WINDOW = DEFAULT_WEEKEND_SHIFT_SETTINGS.lunchInWindow ?? DEFAULT_WEEKEND_LUNCH_OUT_WINDOW;
const INITIAL_INVITE_LINK_LIMITS: Record<string, number> = {
  memory: 70,
  memory_pcs: 50,
  foundry_pcs: 15,
};
const INITIAL_INVITE_LINK_DURATION_HOURS = 72;
const STANDARD_INVITE_LINK_DURATION_HOURS = 24;
const STANDARD_INVITE_LINK_MAX_USES = 5;

const zoneIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cloneTimeWindow(window: TimeWindow): TimeWindow {
  return { start: window.start, end: window.end };
}

function normalizeUserLookupKey(value: string): string {
  return value.trim().replace(/\([^)]*\)/g, "").replace(/\s+/g, "").toLowerCase();
}

function getSheetSourceLabel(mode: SheetUserImportPreview["sourceMode"]): string {
  if (mode === "legacy_gas") {
    return "기존 GAS 형식";
  }

  if (mode === "monthly_matrix") {
    return "월별 표 형식";
  }

  return "단순 표 형식";
}

function mapZone(row: Record<string, unknown>): Zone {
  return {
    id: String(row.id),
    name: String(row.name),
    type: row.type === "tbm" ? "tbm" : "entry",
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    radiusM: Number(row.radius_m),
    isActive: Boolean(row.is_active),
  };
}

function mapAttendancePoint(
  prefix: "check_in" | "tbm" | "tbm_morning" | "lunch_register" | "lunch_out" | "lunch_in" | "tbm_afternoon" | "tbm_checkout" | "check_out",
  row: Record<string, unknown>,
): AttendancePoint | null {
  const occurredAt = row[`${prefix}_at`];

  if (!occurredAt) {
    return null;
  }

  return {
    occurredAt: String(occurredAt),
    latitude: Number(row[`${prefix}_lat`] ?? 0),
    longitude: Number(row[`${prefix}_lng`] ?? 0),
    accuracyM: Number(row[`${prefix}_accuracy_m`] ?? 0),
    zoneId: String(row[`${prefix}_zone_id`] ?? ""),
  };
}

function mapAttendanceRecord(row: Record<string, unknown>): AttendanceRecord {
  const tbmMorning = mapAttendancePoint("tbm_morning", row) ?? mapAttendancePoint("tbm", row);

  return {
    id: String(row.id),
    workDate: String(row.work_date),
    username: String(row.username),
    displayName: String(row.display_name),
    checkIn: mapAttendancePoint("check_in", row),
    tbm: tbmMorning,
    tbmMorning,
    lunchRegister: mapAttendancePoint("lunch_register", row),
    lunchOut: mapAttendancePoint("lunch_out", row),
    lunchIn: mapAttendancePoint("lunch_in", row),
    tbmAfternoon: mapAttendancePoint("tbm_afternoon", row),
    tbmCheckout: mapAttendancePoint("tbm_checkout", row),
    checkOut: mapAttendancePoint("check_out", row),
    correctedByAdmin: Boolean(row.corrected_by_admin),
    correctionNote: row.correction_note ? String(row.correction_note) : null,
    updatedAt: String(row.updated_at),
  };
}

function parseRosterShiftType(value: unknown): ShiftType {
  return value === "late" || value === "weekend" ? value : "day";
}

function mapRosterEntry(row: Record<string, unknown>, displayName: string): RosterEntry {
  const scheduleReasonCode = parseRosterReasonCodeFromSourceKey(row.source_row_key ? String(row.source_row_key) : null);

  return {
    id: String(row.id),
    workDate: String(row.work_date),
    username: String(row.username),
    displayName,
    isScheduled: Boolean(row.is_scheduled) || isHalfDayReasonCode(scheduleReasonCode),
    shiftType: parseRosterShiftType(row.shift_type),
    allowLunchOut: Boolean(row.allow_lunch_out),
    scheduleReasonCode,
    scheduleReason: scheduleReasonCode ? getRosterReasonMessage(scheduleReasonCode) : null,
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeUserRole(value: unknown): UserRole {
  return value === "master" || value === "admin" || value === "sub_admin" ? value : "user";
}

function mapDepartment(row: Record<string, unknown>): Department {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    isActive: Boolean(row.is_active),
  };
}

function isAttendanceWindowAction(value: unknown): value is AttendanceEventCode {
  return typeof value === "string" && ATTENDANCE_WINDOW_ACTIONS.has(value as AttendanceEventCode);
}

function normalizeTimeValue(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : String(value ?? "").trim();
  const match = /^(\d{1,2}):([0-5]\d)/.exec(text);

  if (!match) {
    return fallback;
  }

  const hour = Math.max(0, Math.min(23, Number(match[1]) || 0));
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function getMutableShiftSettings(
  departmentSettings: DepartmentAttendanceSettings,
  shiftType: ShiftType,
): ShiftAttendanceSettings {
  if (shiftType === "late") {
    return departmentSettings.lateShift;
  }

  if (shiftType === "weekend") {
    departmentSettings.weekendShift = cloneShiftSettings(departmentSettings.weekendShift ?? departmentSettings.dayShift);
    return departmentSettings.weekendShift;
  }

  return departmentSettings.dayShift;
}

function patchShiftWindow(
  shiftSettings: ShiftAttendanceSettings,
  actionType: AttendanceEventCode,
  window: { start: string; end: string },
) {
  switch (actionType) {
    case "check_in":
      shiftSettings.checkInWindow = window;
      break;
    case "tbm_morning":
      shiftSettings.tbmMorningWindow = window;
      break;
    case "lunch_register":
    case "lunch_out":
      shiftSettings.lunchOutWindow = window;
      break;
    case "lunch_in":
      shiftSettings.lunchInWindow = window;
      break;
    case "tbm_afternoon":
      shiftSettings.tbmAfternoonWindow = window;
      break;
    case "tbm_checkout":
      shiftSettings.tbmCheckoutWindow = window;
      break;
    case "check_out":
      shiftSettings.checkOutWindow = window;
      break;
  }
}

function applyDepartmentAttendanceWindowRows(
  departmentSettings: DepartmentAttendanceSettings[],
  rows: Record<string, unknown>[],
): DepartmentAttendanceSettings[] {
  const departmentsById = new Map(departmentSettings.map((department) => [department.id, department]));

  for (const row of rows) {
    const departmentId = nullableString(row.department_id);
    const shiftType = parseRosterShiftType(row.shift_type);
    const actionType = row.action_type;

    if (!departmentId || !isAttendanceWindowAction(actionType) || row.is_enabled === false) {
      continue;
    }

    const department = departmentsById.get(departmentId);

    if (!department) {
      continue;
    }

    const window = {
      start: normalizeTimeValue(row.window_start, "00:00"),
      end: normalizeTimeValue(row.window_end, "23:59"),
    };

    patchShiftWindow(getMutableShiftSettings(department, shiftType), actionType, window);
  }

  return departmentSettings;
}

function mergeDepartmentShiftSettings(
  row: Record<string, unknown> | null,
  department: Department,
  baseSettings: AppSettings,
): DepartmentAttendanceSettings {
  const departmentSettings = buildDepartmentAttendanceSettings(department, baseSettings);

  if (!row) {
    return departmentSettings;
  }

  departmentSettings.dayShift.checkInWindow = {
    start: String(row.day_check_in_start ?? departmentSettings.dayShift.checkInWindow.start),
    end: String(row.day_check_in_end ?? departmentSettings.dayShift.checkInWindow.end),
  };
  departmentSettings.dayShift.tbmMorningWindow = {
    start: String(row.day_tbm_start ?? departmentSettings.dayShift.tbmMorningWindow?.start ?? departmentSettings.dayShift.checkInWindow.start),
    end: String(row.day_tbm_end ?? departmentSettings.dayShift.tbmMorningWindow?.end ?? departmentSettings.dayShift.checkInWindow.end),
  };
  departmentSettings.dayShift.tbmAfternoonWindow = {
    start: String(row.day_tbm_afternoon_start ?? departmentSettings.dayShift.tbmAfternoonWindow?.start ?? "13:35"),
    end: String(row.day_tbm_afternoon_end ?? departmentSettings.dayShift.tbmAfternoonWindow?.end ?? "13:45"),
  };
  departmentSettings.dayShift.tbmCheckoutWindow = {
    start: String(row.day_tbm_checkout_start ?? departmentSettings.dayShift.tbmCheckoutWindow?.start ?? "16:30"),
    end: String(row.day_tbm_checkout_end ?? departmentSettings.dayShift.tbmCheckoutWindow?.end ?? "16:45"),
  };
  departmentSettings.dayShift.checkOutWindow = {
    start: String(row.day_check_out_start ?? departmentSettings.dayShift.checkOutWindow.start),
    end: String(row.day_check_out_end ?? departmentSettings.dayShift.checkOutWindow.end),
  };
  departmentSettings.lateShift.checkInWindow = {
    start: String(row.late_check_in_start ?? departmentSettings.lateShift.checkInWindow.start),
    end: String(row.late_check_in_end ?? departmentSettings.lateShift.checkInWindow.end),
  };
  departmentSettings.lateShift.checkOutWindow = {
    start: String(row.late_check_out_start ?? departmentSettings.lateShift.checkOutWindow.start),
    end: String(row.late_check_out_end ?? departmentSettings.lateShift.checkOutWindow.end),
  };
  departmentSettings.weekendShift = {
    ...cloneShiftSettings(departmentSettings.weekendShift ?? departmentSettings.dayShift),
    checkInWindow: { ...departmentSettings.dayShift.checkInWindow },
    tbmMorningWindow: null,
    lunchOutWindow: cloneTimeWindow(DEFAULT_WEEKEND_LUNCH_OUT_WINDOW),
    lunchInWindow: cloneTimeWindow(DEFAULT_WEEKEND_LUNCH_IN_WINDOW),
    tbmAfternoonWindow: null,
    tbmCheckoutWindow: null,
    checkOutWindow: { ...departmentSettings.dayShift.checkOutWindow },
    earlyCheckOutWindow: null,
  };

  return departmentSettings;
}

function applyDepartmentSettings(baseSettings: AppSettings, departmentId: string | null): AppSettings {
  if (!departmentId) {
    return baseSettings;
  }

  const departmentSettings = baseSettings.departmentSettings.find((s) => s.id === departmentId);

  if (!departmentSettings) {
    return baseSettings;
  }

  return {
    ...baseSettings,
    checkInWindow: { ...departmentSettings.dayShift.checkInWindow },
    tbmWindow: { ...(departmentSettings.dayShift.tbmMorningWindow ?? departmentSettings.dayShift.checkInWindow) },
    tbmAfternoonWindow: { ...(departmentSettings.dayShift.tbmAfternoonWindow ?? baseSettings.tbmAfternoonWindow) },
    tbmCheckoutWindow: { ...(departmentSettings.dayShift.tbmCheckoutWindow ?? baseSettings.tbmCheckoutWindow) },
    checkOutWindow: { ...departmentSettings.dayShift.checkOutWindow },
    lateCheckInWindow: { ...departmentSettings.lateShift.checkInWindow },
    lateCheckOutWindow: { ...departmentSettings.lateShift.checkOutWindow },
    dayShift: cloneShiftSettings(departmentSettings.dayShift),
    lateShift: cloneShiftSettings(departmentSettings.lateShift),
    weekendShift: cloneShiftSettings(departmentSettings.weekendShift ?? baseSettings.weekendShift ?? departmentSettings.dayShift),
    departmentSettings: baseSettings.departmentSettings,
  };
}

function mapAdminUserListItem(row: Record<string, unknown>): AdminUserListItem {
  return {
    id: String(row.id),
    username: String(row.username),
    displayName: String(row.display_name),
    role: normalizeUserRole(row.role),
    departmentId: nullableString(row.department_id),
    departmentCode: null,
    departmentName: null,
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at),
  };
}

function buildExpiresAt(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function isInviteLinkUsable(row: Record<string, unknown>): boolean {
  return (
    Boolean(row.is_active) &&
    Date.parse(String(row.expires_at)) > Date.now() &&
    Number(row.used_count ?? 0) < Number(row.max_uses ?? 0)
  );
}

function mapInviteLinkListItem(
  row: Record<string, unknown>,
  department?: Department | null,
): InviteLinkListItem {
  const token = isInviteLinkUsable(row) ? decryptInviteToken(nullableString(row.token_encrypted)) : null;

  return {
    id: String(row.id),
    label: String(row.label),
    departmentId: String(row.department_id),
    departmentCode: department?.code ?? nullableString(row.department_code),
    departmentName: department?.name ?? nullableString(row.department_name),
    maxUses: Number(row.max_uses ?? 0),
    usedCount: Number(row.used_count ?? 0),
    expiresAt: String(row.expires_at),
    isActive: Boolean(row.is_active),
    linkType: row.link_type === "initial" ? "initial" : "standard",
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    lastUsedAt: nullableString(row.last_used_at),
    token,
  };
}

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

function applyEventToRecord(record: AttendanceRecord, eventCode: AttendanceEventCode, point: AttendancePoint) {
  switch (eventCode) {
    case "check_in":
      record.checkIn = point;
      break;
    case "tbm_morning":
      record.tbm = point;
      record.tbmMorning = point;
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

function buildEventColumnPayload(
  eventCode: AttendanceEventCode,
  point: AttendancePoint,
  updatedAt: string,
  mdmVerified?: boolean,
  cameraTestResult?: string | null,
) {
  const prefix = EVENT_STORAGE_PREFIX[eventCode];
  const payload: Record<string, string | number | boolean | null> = {
    [`${prefix}_at`]: point.occurredAt,
    [`${prefix}_zone_id`]: point.zoneId,
    updated_at: updatedAt,
  };

  if (eventCode === "tbm_morning") {
    payload.tbm_at = point.occurredAt;
    payload.tbm_zone_id = point.zoneId;
  }

  if ((eventCode === "check_in" || eventCode === "lunch_register" || eventCode === "lunch_in" || eventCode === "check_out") && mdmVerified !== undefined) {
    payload[`${prefix}_mdm_verified`] = mdmVerified;
    payload[`${prefix}_camera_test`] = cameraTestResult ?? null;
  }

  return payload;
}

async function getSupabaseAttendanceRecordRow(workDate: string, username: string) {
  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from(TABLES.attendanceDailyRecords)
    .select("*")
    .eq("work_date", workDate)
    .eq("username", username)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

function buildDuplicateSuccessResult(record: AttendanceRecord, eventCode: AttendanceEventCode): AttendanceMutationResult {
  return {
    ok: true,
    message: `${EVENT_SUCCESS_LABELS[eventCode]} 기록이 이미 완료되었습니다.`,
    record,
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";

  return code === "23505" || /duplicate key/i.test(message);
}

async function persistAttendanceEvent(input: {
  workDate: string;
  username: string;
  displayName: string;
  eventCode: AttendanceEventCode;
  point: AttendancePoint;
  currentRecord: AttendanceRecord | null;
  validationMessage: string;
  mdmVerified?: boolean;
  cameraTestResult?: string | null;
}): Promise<AttendanceMutationResult> {
  const client = getSupabaseAdminClient();
  const updatedAt = new Date().toISOString();
  const eventPayload = buildEventColumnPayload(input.eventCode, input.point, updatedAt, input.mdmVerified, input.cameraTestResult);
  const eventPrefix = EVENT_STORAGE_PREFIX[input.eventCode];

  if (input.currentRecord) {
    const { data, error } = await client
      .from(TABLES.attendanceDailyRecords)
      .update(eventPayload)
      .eq("work_date", input.workDate)
      .eq("username", input.username)
      .is(`${eventPrefix}_at`, null)
      .select("*")
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return {
        ok: true,
        message: input.validationMessage,
        record: mapAttendanceRecord(data),
      };
    }
  } else {
    const insertPayload = {
      work_date: input.workDate,
      username: input.username,
      display_name: input.displayName,
      corrected_by_admin: false,
      correction_note: null,
      ...eventPayload,
    };

    const { data, error } = await client.from(TABLES.attendanceDailyRecords).insert(insertPayload).select("*").maybeSingle();

    if (!error && data) {
      return {
        ok: true,
        message: input.validationMessage,
        record: mapAttendanceRecord(data),
      };
    }

    if (error && !isUniqueViolation(error)) {
      throw error;
    }
  }

  const refreshedRow = await getSupabaseAttendanceRecordRow(input.workDate, input.username);
  const refreshedRecord = refreshedRow ? mapAttendanceRecord(refreshedRow) : null;

  if (hasRecordedEvent(refreshedRecord, input.eventCode) && refreshedRecord) {
    return buildDuplicateSuccessResult(refreshedRecord, input.eventCode);
  }

  return {
    ok: false,
    message: "다른 요청과 충돌했습니다. 잠시 후 다시 시도하세요.",
    record: refreshedRecord ?? undefined,
  };
}

function buildRosterSourceLabel(mode: RosterSyncPreview["sourceMode"]): string {
  if (mode === "legacy_gas") {
    return "기존 GAS 형식";
  }

  if (mode === "monthly_matrix") {
    return "월별 표 형식";
  }

  return "단순 표 형식";
}

async function buildRosterSyncUsers(
  users: Array<{ username: string; display_name: string; department_id?: unknown }>,
): Promise<RosterSyncUser[]> {
  const departmentIds = users
    .map((user) => nullableString(user.department_id))
    .filter((departmentId): departmentId is string => Boolean(departmentId));
  const departmentMap = await loadDepartmentMap(departmentIds);

  return users.map((user) => {
    const departmentId = nullableString(user.department_id);
    const department = departmentId ? departmentMap.get(departmentId) : null;

    return {
      username: user.username,
      displayName: user.display_name,
      departmentId,
      departmentCode: department?.code ?? null,
    };
  });
}

async function buildSupabaseRosterSyncPreview(workDate: string): Promise<RosterSyncPreview> {
  const [users, existingRows] = await Promise.all([
    getSupabaseActiveUsers(),
    getSupabaseRosterEntries(workDate),
  ]);
  const existingMap = new Map(existingRows.map((row) => [String(row.username), row]));
  const rosterSyncUsers = await buildRosterSyncUsers(users);
  const snapshot = await fetchSheetRosterSnapshot(
    workDate,
    rosterSyncUsers,
  );

  const rows = snapshot.assignments
    .map((assignment) => {
      const existing = existingMap.get(assignment.username);
      const displayName = users.find((user) => user.username === assignment.username)?.display_name ?? assignment.username;

      return {
        id: `${workDate}-${assignment.username}`,
        workDate,
        username: assignment.username,
        displayName,
        isScheduled: assignment.isScheduled,
        shiftType: assignment.shiftType,
        allowLunchOut: assignment.allowLunchOut || Boolean(existing?.allow_lunch_out),
        scheduleReasonCode: assignment.scheduleReasonCode ?? null,
        scheduleReason: assignment.scheduleReason ?? null,
      } satisfies RosterEntry;
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "ko"));

  return {
    dataSource: "supabase",
    workDate,
    sourceMode: snapshot.mode,
    sourceLabel: buildRosterSourceLabel(snapshot.mode),
    summary: {
      scheduledCount: rows.filter((row) => row.isScheduled).length,
      dayShiftCount: rows.filter((row) => row.isScheduled && row.shiftType === "day").length,
      lateShiftCount: rows.filter((row) => row.isScheduled && row.shiftType === "late").length,
      excludedCount: rows.filter((row) => !row.isScheduled).length,
      lunchAllowedCount: rows.filter((row) => row.allowLunchOut).length,
    },
    rows,
    unmatchedNames: snapshot.unmatchedNames,
  };
}
function isSupabaseSchemaMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";

  return code === "PGRST205" || /Could not find the table .* in the schema cache/i.test(message) || /relation .* does not exist/i.test(message);
}

export async function getSupabaseSetupStatus(): Promise<{ ready: boolean; message: string | null }> {
  const client = getSupabaseAdminClient();
  const { error } = await client.from(TABLES.users).select("username").limit(1);

  if (!error) {
    return {
      ready: true,
      message: null,
    };
  }

  if (isSupabaseSchemaMissingError(error)) {
    return {
      ready: false,
      message: "Supabase는 연결됐지만 데이터베이스 테이블이 아직 없습니다. supabase/schema.sql과 supabase/seed.sql을 먼저 실행하세요.",
    };
  }

  throw error;
}

export async function authenticateSupabaseUser(username: string, password: string): Promise<SessionUser | null> {
  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from(TABLES.users)
    .select("username, display_name, role, is_active, password_hash, department_id")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data || !data.is_active) {
    return null;
  }

  if (!compareSync(password, data.password_hash)) {
    return null;
  }

  return {
    username: data.username,
    displayName: data.display_name,
    role: normalizeUserRole(data.role),
    departmentId: nullableString(data.department_id),
    departmentCode: null,
    departmentName: null,
  };
}

export async function changeSupabasePassword(input: {
  username: string;
  currentPassword: string;
  nextPassword: string;
}): Promise<{ ok: boolean; message: string }> {
  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from(TABLES.users)
    .select("username, is_active, password_hash")
    .eq("username", input.username)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data || !data.is_active) {
    return {
      ok: false,
      message: "사용자 정보를 찾을 수 없습니다.",
    };
  }

  if (!compareSync(input.currentPassword, data.password_hash)) {
    return {
      ok: false,
      message: "현재 비밀번호가 올바르지 않습니다.",
    };
  }

  const { error: updateError } = await client
    .from(TABLES.users)
    .update({ password_hash: hashSync(input.nextPassword, 10) })
    .eq("username", input.username);

  if (updateError) {
    throw updateError;
  }

  return {
    ok: true,
    message: "비밀번호를 변경했습니다. 새 비밀번호로 로그인하세요.",
  };
}

export async function getSupabaseSessionUser(username: string): Promise<SessionUser | null> {
  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from(TABLES.users)
    .select("username, display_name, role, is_active, department_id")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data || !data.is_active) {
    return null;
  }

  return {
    username: data.username,
    displayName: data.display_name,
    role: normalizeUserRole(data.role),
    departmentId: nullableString(data.department_id),
    departmentCode: null,
    departmentName: null,
  };
}

export async function getSupabaseUserDepartmentCode(username: string): Promise<string | null> {
  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from(TABLES.users)
    .select("department_id")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const departmentId = nullableString(data?.department_id);
  if (!departmentId) {
    return null;
  }

  return (await getDepartmentById(departmentId))?.code ?? null;
}

export async function getSessionUserByKakaoId(kakaoId: string): Promise<SessionUser | null> {
  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from(TABLES.users)
    .select("username, display_name, role, is_active, department_id")
    .eq("kakao_id", kakaoId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data || !data.is_active) {
    return null;
  }

  return {
    username: data.username,
    displayName: data.display_name,
    role: normalizeUserRole(data.role),
    departmentId: nullableString(data.department_id),
    departmentCode: null,
    departmentName: null,
  };
}

export async function createKakaoUser(kakaoId: string, displayName: string, inviteToken: string): Promise<SessionUser> {
  const client = getSupabaseAdminClient();
  const tokenHash = hashInviteToken(inviteToken);
  const { data, error } = await client.rpc("create_account_user_from_invite_link", {
    p_token_hash: tokenHash,
    p_kakao_id: kakaoId,
    p_display_name: displayName,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    throw new Error("초대링크가 유효하지 않거나 만료되었습니다.");
  }

  return {
    username: String(row.username),
    displayName: String(row.display_name),
    role: "user",
    departmentId: String(row.department_id),
    departmentCode: nullableString(row.department_code),
    departmentName: nullableString(row.department_name),
  };
}

export async function getSupabaseAdminUsers(departmentId?: string | null): Promise<AdminUserListItem[]> {
  const client = getSupabaseAdminClient();
  let query = client
    .from(TABLES.users)
    .select("id, username, display_name, role, is_active, created_at, department_id");

  if (departmentId !== undefined) {
    if (departmentId) {
      query = query.eq("department_id", departmentId);
    } else {
      query = query.is("department_id", null);
    }
  }

  const { data, error } = await query
    .order("role", { ascending: true })
    .order("display_name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapAdminUserListItem(row));
}

async function hasActiveDepartment(departmentId: string): Promise<boolean> {
  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from(TABLES.departments)
    .select("id")
    .eq("id", departmentId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

async function getDefaultActiveDepartmentId(): Promise<string | null> {
  const client = getSupabaseAdminClient();
  const { data: defaultDepartment, error: defaultDepartmentError } = await client
    .from(TABLES.departments)
    .select("id")
    .eq("code", "memory_pcs")
    .eq("is_active", true)
    .maybeSingle();

  if (defaultDepartmentError) {
    throw defaultDepartmentError;
  }

  if (defaultDepartment?.id) {
    return String(defaultDepartment.id);
  }

  const { data: fallbackDepartment, error: fallbackDepartmentError } = await client
    .from(TABLES.departments)
    .select("id")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fallbackDepartmentError) {
    throw fallbackDepartmentError;
  }

  return fallbackDepartment?.id ? String(fallbackDepartment.id) : null;
}

async function getDepartmentById(departmentId: string): Promise<Department | null> {
  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from(TABLES.departments)
    .select("id, code, name, is_active")
    .eq("id", departmentId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapDepartment(data) : null;
}

async function getActiveDepartmentsByCodes(codes: string[]): Promise<Department[]> {
  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from(TABLES.departments)
    .select("id, code, name, is_active")
    .in("code", codes)
    .eq("is_active", true);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapDepartment(row));
}

function canDepartmentAdminManageRole(role: UserRole): boolean {
  return role === "user" || role === "sub_admin";
}

async function loadDepartmentMap(departmentIds: string[]): Promise<Map<string, Department>> {
  const uniqueIds = Array.from(new Set(departmentIds.filter(Boolean)));
  if (!uniqueIds.length) {
    return new Map();
  }

  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from(TABLES.departments)
    .select("id, code, name, is_active")
    .in("id", uniqueIds);

  if (error) {
    throw error;
  }

  return new Map((data ?? []).map((row) => {
    const department = mapDepartment(row);
    return [department.id, department];
  }));
}

async function insertInviteLink(input: {
  department: Department;
  label: string;
  maxUses: number;
  expiresAt: string;
  linkType: InviteLinkType;
  createdBy: string;
}): Promise<InviteLinkListItem> {
  const client = getSupabaseAdminClient();
  const token = generateInviteToken(input.department.code);
  const { data, error } = await client
    .from(TABLES.inviteLinks)
    .insert({
      token_hash: hashInviteToken(token),
      token_encrypted: encryptInviteToken(token),
      label: input.label,
      department_id: input.department.id,
      max_uses: input.maxUses,
      used_count: 0,
      expires_at: input.expiresAt,
      is_active: true,
      link_type: input.linkType,
      created_by: input.createdBy,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return {
    ...mapInviteLinkListItem(data, input.department),
    token,
  };
}

export async function getSupabaseInviteRegistrationContext(token: string): Promise<InviteRegistrationContext | null> {
  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from(TABLES.inviteLinks)
    .select("*")
    .eq("token_hash", hashInviteToken(token))
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data || !isInviteLinkUsable(data)) {
    return null;
  }

  const department = await getDepartmentById(String(data.department_id));
  if (!department) {
    return null;
  }

  return {
    departmentId: department.id,
    departmentCode: department.code,
    departmentName: department.name,
    maxUses: Number(data.max_uses ?? 0),
    usedCount: Number(data.used_count ?? 0),
    expiresAt: String(data.expires_at),
  };
}

export async function getSupabaseInviteLinks(actor: SessionUser): Promise<InviteLinkListItem[]> {
  if (actor.role !== "master" && actor.role !== "admin") {
    return [];
  }

  if (actor.role === "admin" && !actor.departmentId) {
    return [];
  }

  const client = getSupabaseAdminClient();
  let query = client
    .from(TABLES.inviteLinks)
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(50);

  if (actor.role === "admin") {
    query = query.eq("department_id", actor.departmentId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const departmentMap = await loadDepartmentMap((data ?? []).map((row) => String(row.department_id)));
  return (data ?? []).map((row) => mapInviteLinkListItem(row, departmentMap.get(String(row.department_id))));
}

export async function createSupabaseInitialInviteLinks(actor: SessionUser): Promise<{ ok: boolean; message: string; links: InviteLinkListItem[] }> {
  if (actor.role !== "master") {
    return {
      ok: false,
      message: "초기 가입 링크는 마스터만 생성할 수 있습니다.",
      links: [],
    };
  }

  const departments = await getActiveDepartmentsByCodes(Object.keys(INITIAL_INVITE_LINK_LIMITS));
  const departmentsByCode = new Map(departments.map((department) => [department.code, department]));
  const missingCodes = Object.keys(INITIAL_INVITE_LINK_LIMITS).filter((code) => !departmentsByCode.has(code));

  if (missingCodes.length) {
    return {
      ok: false,
      message: `초기 링크를 만들 부서를 찾을 수 없습니다: ${missingCodes.join(", ")}`,
      links: [],
    };
  }

  const client = getSupabaseAdminClient();
  const departmentIds = departments.map((department) => department.id);
  const { error: deactivateError } = await client
    .from(TABLES.inviteLinks)
    .update({ is_active: false })
    .in("department_id", departmentIds)
    .eq("link_type", "initial")
    .eq("is_active", true);

  if (deactivateError) {
    throw deactivateError;
  }

  const expiresAt = buildExpiresAt(INITIAL_INVITE_LINK_DURATION_HOURS);
  const links: InviteLinkListItem[] = [];

  for (const [code, maxUses] of Object.entries(INITIAL_INVITE_LINK_LIMITS)) {
    const department = departmentsByCode.get(code);
    if (!department) continue;
    links.push(await insertInviteLink({
      department,
      label: `초기 가입 - ${department.name}`,
      maxUses,
      expiresAt,
      linkType: "initial",
      createdBy: actor.username,
    }));
  }

  return {
    ok: true,
    message: "초기 가입 링크를 생성했습니다.",
    links,
  };
}

export async function createSupabaseStandardInviteLink(
  input: { departmentId: string | null; maxUses: number },
  actor: SessionUser,
): Promise<{ ok: boolean; message: string; links: InviteLinkListItem[] }> {
  if (actor.role !== "master" && actor.role !== "admin") {
    return {
      ok: false,
      message: "초대링크 생성 권한이 없습니다.",
      links: [],
    };
  }

  const departmentId = actor.role === "admin" ? actor.departmentId : input.departmentId;

  if (!departmentId) {
    return {
      ok: false,
      message: "부서를 선택하세요.",
      links: [],
    };
  }

  if (input.maxUses < 1 || input.maxUses > STANDARD_INVITE_LINK_MAX_USES) {
    return {
      ok: false,
      message: `신규 가입 링크는 최대 ${STANDARD_INVITE_LINK_MAX_USES}명까지 사용할 수 있습니다.`,
      links: [],
    };
  }

  const department = await getDepartmentById(departmentId);
  if (!department) {
    return {
      ok: false,
      message: "선택한 부서를 찾을 수 없습니다.",
      links: [],
    };
  }

  const link = await insertInviteLink({
    department,
    label: `신규 가입 - ${department.name}`,
    maxUses: input.maxUses,
    expiresAt: buildExpiresAt(STANDARD_INVITE_LINK_DURATION_HOURS),
    linkType: "standard",
    createdBy: actor.username,
  });

  return {
    ok: true,
    message: "신규 가입 링크를 생성했습니다.",
    links: [link],
  };
}

export async function deactivateSupabaseInviteLink(
  id: string,
  actor: SessionUser,
): Promise<{ ok: boolean; message: string }> {
  if (actor.role !== "master" && actor.role !== "admin") {
    return {
      ok: false,
      message: "초대링크 관리 권한이 없습니다.",
    };
  }

  const client = getSupabaseAdminClient();
  let query = client
    .from(TABLES.inviteLinks)
    .select("id, department_id")
    .eq("id", id);

  if (actor.role === "admin") {
    if (!actor.departmentId) {
      return {
        ok: false,
        message: "소속 부서가 지정되지 않아 초대링크를 관리할 수 없습니다.",
      };
    }
    query = query.eq("department_id", actor.departmentId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return {
      ok: false,
      message: "초대링크를 찾을 수 없습니다.",
    };
  }

  const { error: updateError } = await client
    .from(TABLES.inviteLinks)
    .update({ is_active: false })
    .eq("id", id);

  if (updateError) {
    throw updateError;
  }

  const { data: verifyData, error: verifyError } = await client
    .from(TABLES.inviteLinks)
    .select("id, is_active")
    .eq("id", id)
    .maybeSingle();

  if (verifyError) {
    throw verifyError;
  }

  if (!verifyData || verifyData.is_active !== false) {
    return {
      ok: false,
      message: "초대링크 폐기 상태를 확인하지 못했습니다.",
    };
  }

  return {
    ok: true,
    message: "초대링크를 폐기했습니다.",
  };
}

export async function saveSupabaseAdminUser(
  input: AdminUserMutationInput,
  actor: SessionUser,
): Promise<{ ok: boolean; message: string }> {
  const client = getSupabaseAdminClient();

  if (actor.role !== "master" && actor.role !== "admin") {
    return {
      ok: false,
      message: "계정 관리 권한이 없습니다.",
    };
  }

  if (!input.departmentId) {
    return {
      ok: false,
      message: "부서를 선택하세요.",
    };
  }

  if (!(await hasActiveDepartment(input.departmentId))) {
    return {
      ok: false,
      message: "선택한 부서를 찾을 수 없습니다.",
    };
  }

  if (actor.role === "admin") {
    if (!actor.departmentId) {
      return {
        ok: false,
        message: "소속 부서가 지정되지 않아 계정을 관리할 수 없습니다.",
      };
    }

    if (input.mode === "create") {
      return {
        ok: false,
        message: "관리자는 새 계정을 생성할 수 없습니다.",
      };
    }

    if (!canDepartmentAdminManageRole(input.role)) {
      return {
        ok: false,
        message: "관리자는 일반 사용자와 부관리자 권한만 지정할 수 있습니다.",
      };
    }
  }

  if (input.mode === "create") {
    const { data: existingUser, error: existingUserError } = await client
      .from(TABLES.users)
      .select("username")
      .eq("username", input.username)
      .maybeSingle();

    if (existingUserError) {
      throw existingUserError;
    }

    if (existingUser) {
      return {
        ok: false,
        message: "이미 존재하는 로그인 ID입니다.",
      };
    }

    const { error: insertError } = await client.from(TABLES.users).insert({
      username: input.username,
      display_name: input.displayName,
      password_hash: hashSync(input.password ?? "", 10),
      role: input.role,
      is_active: input.isActive,
      department_id: input.departmentId ?? null,
    });

    if (insertError) {
      throw insertError;
    }

    return {
      ok: true,
      message: "사용자 계정을 생성했습니다.",
    };
  }

  const { data: currentUser, error: currentUserError } = await client
    .from(TABLES.users)
    .select("username, role, is_active, department_id")
    .eq("username", input.username)
    .maybeSingle();

  if (currentUserError) {
    throw currentUserError;
  }

  if (!currentUser) {
    return {
      ok: false,
      message: "수정할 사용자를 찾을 수 없습니다.",
    };
  }

  if (actor.role === "admin") {
    if (nullableString(currentUser.department_id) !== actor.departmentId) {
      return {
        ok: false,
        message: "소속 부서 사용자만 관리할 수 있습니다.",
      };
    }

    if (!canDepartmentAdminManageRole(normalizeUserRole(currentUser.role))) {
      return {
        ok: false,
        message: "관리자 또는 마스터 계정은 수정할 수 없습니다.",
      };
    }
  }

  const removingLastActiveMaster =
    currentUser.role === "master" &&
    currentUser.is_active &&
    (input.role !== "master" || !input.isActive);

  if (removingLastActiveMaster) {
    const { count, error: countError } = await client
      .from(TABLES.users)
      .select("*", { count: "exact", head: true })
      .eq("role", "master")
      .eq("is_active", true);

    if (countError) {
      throw countError;
    }

    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        message: "마지막 활성 마스터 계정은 비활성화하거나 권한을 변경할 수 없습니다.",
      };
    }
  }

  const updatePayload: {
    display_name: string;
    role: "user" | "admin" | "sub_admin" | "master";
    is_active: boolean;
    department_id: string | null;
    password_hash?: string;
  } = {
    display_name: input.displayName,
    role: input.role,
    is_active: input.isActive,
    department_id: input.departmentId ?? null,
  };

  if (input.password) {
    updatePayload.password_hash = hashSync(input.password, 10);
  }

  const { error: updateError } = await client.from(TABLES.users).update(updatePayload).eq("username", input.username);

  if (updateError) {
    throw updateError;
  }

  return {
    ok: true,
    message: input.password ? "사용자 정보를 저장하고 비밀번호를 변경했습니다." : "사용자 정보를 저장했습니다.",
  };
}
export async function deleteSupabaseAdminUser(
  username: string,
  actor: SessionUser,
): Promise<{ ok: boolean; message: string }> {
  const client = getSupabaseAdminClient();

  if (username === actor.username) {
    return {
      ok: false,
      message: "현재 로그인한 계정은 직접 비활성화할 수 없습니다.",
    };
  }

  if (actor.role !== "master" && actor.role !== "admin") {
    return {
      ok: false,
      message: "계정 관리 권한이 없습니다.",
    };
  }

  const { data: currentUser, error: currentUserError } = await client
    .from(TABLES.users)
    .select("username, role, is_active, department_id")
    .eq("username", username)
    .maybeSingle();

  if (currentUserError) {
    throw currentUserError;
  }

  if (!currentUser) {
    return {
      ok: false,
      message: "삭제할 사용자를 찾을 수 없습니다.",
    };
  }

  if (actor.role === "admin") {
    if (!actor.departmentId) {
      return {
        ok: false,
        message: "소속 부서가 지정되지 않아 계정을 관리할 수 없습니다.",
      };
    }

    if (nullableString(currentUser.department_id) !== actor.departmentId) {
      return {
        ok: false,
        message: "소속 부서 사용자만 비활성화할 수 있습니다.",
      };
    }

    if (!canDepartmentAdminManageRole(normalizeUserRole(currentUser.role))) {
      return {
        ok: false,
        message: "관리자 또는 마스터 계정은 비활성화할 수 없습니다.",
      };
    }
  }

  if (currentUser.role === "master" && currentUser.is_active) {
    const { count, error: countError } = await client
      .from(TABLES.users)
      .select("*", { count: "exact", head: true })
      .eq("role", "master")
      .eq("is_active", true);

    if (countError) {
      throw countError;
    }

    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        message: "마지막 활성 마스터 계정은 비활성화할 수 없습니다.",
      };
    }
  }

  const { error: updateError } = await client
    .from(TABLES.users)
    .update({ is_active: false })
    .eq("username", username);

  if (updateError) {
    throw updateError;
  }

  return {
    ok: true,
    message: "계정을 비활성화했습니다. 출퇴근 기록은 보존됩니다.",
  };
}

export async function getSupabaseSheetUserImportPreview(): Promise<SheetUserImportPreview> {
  const [existingUsers, sheetCandidates] = await Promise.all([
    getSupabaseAdminUsers(),
    fetchSheetUserCandidates(),
  ]);

  const existingKeys = new Set<string>();

  for (const user of existingUsers) {
    existingKeys.add(normalizeUserLookupKey(user.username));
    existingKeys.add(normalizeUserLookupKey(user.displayName));
  }

  const missingNames = sheetCandidates.names.filter((name) => !existingKeys.has(normalizeUserLookupKey(name)));

  return {
    sourceMode: sheetCandidates.mode,
    sourceLabel: getSheetSourceLabel(sheetCandidates.mode),
    totalSheetNames: sheetCandidates.names.length,
    matchedCount: Math.max(sheetCandidates.names.length - missingNames.length, 0),
    missingNames,
  };
}

export async function importSupabaseUsersFromSheet(
  input: AdminUserImportInput,
): Promise<{ ok: boolean; message: string; createdCount: number; skippedCount: number }> {
  const client = getSupabaseAdminClient();
  const preview = await getSupabaseSheetUserImportPreview();

  if (preview.missingNames.length === 0) {
    return {
      ok: true,
      message: "시트 이름과 비교했을 때 새로 만들 계정이 없습니다.",
      createdCount: 0,
      skippedCount: 0,
    };
  }

  const selectedNames = (input.selectedNames ?? preview.missingNames)
    .map((name) => name.trim())
    .filter(Boolean);

  if (selectedNames.length === 0) {
    return {
      ok: false,
      message: "생성할 이름을 하나 이상 선택하세요.",
      createdCount: 0,
      skippedCount: preview.missingNames.length,
    };
  }

  const allowedKeys = new Set(preview.missingNames.map((name) => normalizeUserLookupKey(name)));
  const invalidSelection = selectedNames.find((name) => !allowedKeys.has(normalizeUserLookupKey(name)));

  if (invalidSelection) {
    return {
      ok: false,
      message: `미리보기 목록에 없는 이름은 생성할 수 없습니다: ${invalidSelection}`,
      createdCount: 0,
      skippedCount: preview.missingNames.length,
    };
  }

  const { data: currentUsers, error: currentUsersError } = await client.from(TABLES.users).select("username, display_name");

  if (currentUsersError) {
    throw currentUsersError;
  }

  const existingKeys = new Set<string>();

  for (const user of currentUsers ?? []) {
    existingKeys.add(normalizeUserLookupKey(String(user.username ?? "")));
    existingKeys.add(normalizeUserLookupKey(String(user.display_name ?? "")));
  }

  const defaultDepartmentId = await getDefaultActiveDepartmentId();

  if (!defaultDepartmentId) {
    return {
      ok: false,
      message: "기본 부서를 찾을 수 없어 시트 사용자 계정을 생성할 수 없습니다.",
      createdCount: 0,
      skippedCount: selectedNames.length,
    };
  }

  const rows = selectedNames
    .filter((name) => !existingKeys.has(normalizeUserLookupKey(name)))
    .map((name) => ({
      username: name,
      display_name: name,
      password_hash: hashSync(input.password, 10),
      role: "user" as const,
      department_id: defaultDepartmentId,
      is_active: true,
    }));

  if (rows.length === 0) {
    return {
      ok: true,
      message: "선택한 이름 기준으로 새로 만들 계정이 없습니다.",
      createdCount: 0,
      skippedCount: selectedNames.length,
    };
  }

  const { error: insertError } = await client.from(TABLES.users).insert(rows);

  if (insertError) {
    throw insertError;
  }

  return {
    ok: true,
    message: `${rows.length}명의 사용자 계정을 생성했습니다. 초기 비밀번호는 입력한 공통 비밀번호로 설정했습니다.`,
    createdCount: rows.length,
    skippedCount: Math.max(selectedNames.length - rows.length, 0),
  };
}

export async function getSupabaseDepartments(): Promise<Department[]> {
  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from(TABLES.departments)
    .select("id, code, name, is_active")
    .eq("is_active", true)
    .order("name");

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapDepartment);
}

export async function getSupabaseZones(): Promise<Zone[]> {
  const client = getSupabaseAdminClient();
  const { data, error } = await client.from(TABLES.zones).select("*").order("name");

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapZone(row));
}

async function getSupabaseDepartmentAttendanceWindowRows(departmentIds: string[]): Promise<Record<string, unknown>[]> {
  if (departmentIds.length === 0) {
    return [];
  }

  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from(TABLES.attendanceWindows)
    .select("department_id, shift_type, action_type, window_start, window_end, is_enabled")
    .in("department_id", departmentIds);

  if (error) {
    if (isSupabaseSchemaMissingError(error)) {
      return [];
    }

    throw error;
  }

  return (data ?? []) as Record<string, unknown>[];
}

export async function getSupabaseSettings(): Promise<AppSettings> {
  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from(TABLES.globalSettings)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const settings = buildOperationalSettings(Number(data?.max_gps_accuracy_m ?? defaultSettings.maxGpsAccuracyM));

  if (data) {
    settings.checkInWindow = {
      start: String(data.check_in_start ?? settings.checkInWindow.start),
      end: String(data.check_in_end ?? settings.checkInWindow.end),
    };
    settings.tbmWindow = {
      start: String(data.tbm_start ?? settings.tbmWindow.start),
      end: String(data.tbm_end ?? settings.tbmWindow.end),
    };
    settings.tbmAfternoonWindow = {
      start: String(data.tbm_afternoon_start ?? settings.tbmAfternoonWindow.start),
      end: String(data.tbm_afternoon_end ?? settings.tbmAfternoonWindow.end),
    };
    settings.tbmCheckoutWindow = {
      start: String(data.tbm_checkout_start ?? settings.tbmCheckoutWindow.start),
      end: String(data.tbm_checkout_end ?? settings.tbmCheckoutWindow.end),
    };
    settings.checkOutWindow = {
      start: String(data.check_out_start ?? settings.checkOutWindow.start),
      end: String(data.check_out_end ?? settings.checkOutWindow.end),
    };

    settings.lateCheckInWindow = {
      start: String(data.late_check_in_start ?? settings.lateCheckInWindow.start),
      end: String(data.late_check_in_end ?? settings.lateCheckInWindow.end),
    };
    settings.lateCheckOutWindow = {
      start: String(data.late_check_out_start ?? settings.lateCheckOutWindow.start),
      end: String(data.late_check_out_end ?? settings.lateCheckOutWindow.end),
    };
  }

  settings.dayShift.checkInWindow = { ...settings.checkInWindow };
  settings.dayShift.tbmMorningWindow = { ...settings.tbmWindow };
  settings.dayShift.tbmAfternoonWindow = { ...settings.tbmAfternoonWindow };
  settings.dayShift.tbmCheckoutWindow = { ...settings.tbmCheckoutWindow };
  settings.dayShift.checkOutWindow = { ...settings.checkOutWindow };

  settings.lateShift.checkInWindow = { ...settings.lateCheckInWindow };
  settings.lateShift.checkOutWindow = { ...settings.lateCheckOutWindow };
  settings.weekendShift = {
    ...cloneShiftSettings(settings.weekendShift ?? settings.dayShift),
    checkInWindow: { ...settings.checkInWindow },
    tbmMorningWindow: null,
    lunchOutWindow: cloneTimeWindow(DEFAULT_WEEKEND_LUNCH_OUT_WINDOW),
    lunchInWindow: cloneTimeWindow(DEFAULT_WEEKEND_LUNCH_IN_WINDOW),
    tbmAfternoonWindow: null,
    tbmCheckoutWindow: null,
    checkOutWindow: { ...settings.checkOutWindow },
    earlyCheckOutWindow: null,
  };

  const { data: deptRows } = await client
    .from(TABLES.departments)
    .select("id, code, name, is_active")
    .eq("is_active", true)
    .order("name");

  const departments: Department[] = (deptRows ?? []).map(mapDepartment);

  if (departments.length > 0) {
    const departmentIds = departments.map((d) => d.id);
    const [{ data: deptSettingsRows, error: deptSettingsError }, attendanceWindowRows] = await Promise.all([
      client
        .from(TABLES.departmentSettings)
        .select("*")
        .in("department_id", departmentIds),
      getSupabaseDepartmentAttendanceWindowRows(departmentIds),
    ]);

    if (deptSettingsError) {
      throw deptSettingsError;
    }

    const deptSettingsMap = new Map(
      (deptSettingsRows ?? []).map((row) => [String(row.department_id), row as Record<string, unknown>]),
    );

    settings.departmentSettings = applyDepartmentAttendanceWindowRows(departments.map((dept) =>
      mergeDepartmentShiftSettings(deptSettingsMap.get(dept.id) ?? null, dept, settings),
    ), attendanceWindowRows);
  }

  return settings;
}

async function getSupabaseRosterEntries(workDate: string) {
  const client = getSupabaseAdminClient();
  const { data, error } = await client.from(TABLES.rosters).select("*").eq("work_date", workDate);

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function getSupabaseRosterEntryForUser(workDate: string, username: string) {
  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from(TABLES.rosters)
    .select("*")
    .eq("work_date", workDate)
    .eq("username", username)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function getSupabaseAttendanceRecords(workDate: string) {
  const client = getSupabaseAdminClient();
  const { data, error } = await client.from(TABLES.attendanceDailyRecords).select("*").eq("work_date", workDate);

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function fetchAllPages<T>(
  queryFn: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const PAGE_SIZE = 1000;
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const result = await queryFn(offset, offset + PAGE_SIZE - 1);
    if (result.error) throw result.error;
    const rows = result.data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

export async function getSupabaseMonthlyExportData(startDate: string, endDate: string, departmentId?: string | null) {
  const client = getSupabaseAdminClient();
  let usersQuery = client.from(TABLES.users).select("username, display_name, department_id, is_active").eq("is_active", true);
  if (departmentId) {
    usersQuery = usersQuery.eq("department_id", departmentId);
  }
  const [usersResult, departmentsResult] = await Promise.all([
    usersQuery,
    client.from(TABLES.departments).select("*"),
  ]);
  if (usersResult.error) throw usersResult.error;
  if (departmentsResult.error) throw departmentsResult.error;

  const [allRecords, allRosters] = await Promise.all([
    fetchAllPages<Record<string, unknown>>((from, to) =>
      client.from(TABLES.attendanceDailyRecords).select("*").gte("work_date", startDate).lte("work_date", endDate).order("work_date").range(from, to),
    ),
    fetchAllPages<Record<string, unknown>>((from, to) =>
      client.from(TABLES.rosters).select("*").gte("work_date", startDate).lte("work_date", endDate).order("work_date").range(from, to),
    ),
  ]);

  return {
    users: usersResult.data ?? [],
    records: allRecords.map(mapAttendanceRecord),
    rosters: allRosters,
    departments: departmentsResult.data ?? [],
  };
}

async function getSupabaseActiveUsers(departmentId?: string | null) {
  const client = getSupabaseAdminClient();
  let query = client
    .from(TABLES.users)
    .select("username, display_name, role, is_active, department_id")
    .eq("is_active", true);

  if (departmentId !== undefined) {
    // undefined = master (필터 없음), string = 부서 필터, null = 부서 미지정 필터
    if (departmentId) {
      query = query.eq("department_id", departmentId);
    } else {
      query = query.is("department_id", null);
    }
  }

  const { data, error } = await query.order("display_name");

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getSupabaseUserTodayView(username: string, sessionUser?: SessionUser): Promise<UserTodayView> {
  const workDate = getKoreaDateKey();
  const [settings, rosterRow, recordRow] = await Promise.all([
    getSupabaseSettings(),
    getSupabaseRosterEntryForUser(workDate, username),
    getSupabaseAttendanceRecordRow(workDate, username),
  ]);

  const user = sessionUser ?? (await getSupabaseSessionUser(username));

  if (!user) {
    throw new Error(`Unknown user: ${username}`);
  }

  const rosterEntry = rosterRow
    ? mapRosterEntry(rosterRow, user.displayName)
    : user.role === "master" || user.role === "admin" || user.role === "sub_admin"
      ? {
          id: `${workDate}-${username}`,
          workDate,
          username,
          displayName: user.displayName,
          isScheduled: true,
          shiftType: "day" as const,
          allowLunchOut: false,
          scheduleReasonCode: null,
          scheduleReason: null,
        }
      : {
          id: `${workDate}-${username}`,
          workDate,
          username,
          displayName: user.displayName,
          isScheduled: false,
          shiftType: "day" as const,
          allowLunchOut: false,
          scheduleReasonCode: "not_synced" as const,
          scheduleReason: getRosterReasonMessage("not_synced"),
        };
  const record = recordRow ? mapAttendanceRecord(recordRow) : null;
  const shiftType = rosterEntry.shiftType;
  const effectiveSettings = applyDepartmentSettings(settings, user.departmentId);
  const currentPeriod = getCurrentPeriod(effectiveSettings, new Date(), [rosterEntry]);
  const actionStates = [
    buildActionAvailability("check-in", rosterEntry, record, effectiveSettings),
    buildActionAvailability("tbm", rosterEntry, record, effectiveSettings),
    buildActionAvailability("lunch-register", rosterEntry, record, effectiveSettings),
    buildActionAvailability("lunch-out", rosterEntry, record, effectiveSettings),
    buildActionAvailability("lunch-in", rosterEntry, record, effectiveSettings),
    buildActionAvailability("check-out", rosterEntry, record, effectiveSettings),
  ];
  const eventStates = buildEventStates({
    shiftType,
    rosterEntry,
    record,
    settings: effectiveSettings,
  });

  return {
    dateKey: workDate,
    dateLabel: getKoreaDateLabel(),
    user,
    isScheduled: rosterEntry.isScheduled || isHalfDayReasonCode(rosterEntry.scheduleReasonCode),
    shiftType,
    currentPeriod,
    record,
    actionStates: filterActionStatesForDepartment(actionStates, user.departmentCode),
    eventStates: filterEventStatesForDepartment(eventStates, user.departmentCode),
  };
}

export async function getSupabaseDashboardView(departmentId?: string | null): Promise<DashboardView> {
  const workDate = getKoreaDateKey();
  const [users, zones, settings, rosterRows, recordRows] = await Promise.all([
    getSupabaseActiveUsers(departmentId),
    getSupabaseZones(),
    getSupabaseSettings(),
    getSupabaseRosterEntries(workDate),
    getSupabaseAttendanceRecords(workDate),
  ]);

  const rosterMap = new Map(rosterRows.map((row) => [row.username, row]));
  const recordMap = new Map(recordRows.map((row) => [row.username, row]));

  const scheduledUsers = users.map((user) => {
    const rosterRow = rosterMap.get(user.username);
    const scheduleReasonCode = rosterRow
      ? parseRosterReasonCodeFromSourceKey(String(rosterRow.source_row_key ?? ""))
      : "not_synced";

    return {
      id: rosterRow?.id ?? `${workDate}-${user.username}`,
      workDate,
      username: user.username,
      displayName: user.display_name,
      isScheduled: rosterRow?.is_scheduled ?? false,
      shiftType: parseRosterShiftType(rosterRow?.shift_type),
      allowLunchOut: Boolean(rosterRow?.allow_lunch_out),
      scheduleReasonCode,
      scheduleReason: scheduleReasonCode ? getRosterReasonMessage(scheduleReasonCode) : null,
    } satisfies RosterEntry;
  });

  const rows = scheduledUsers.map((entry) => {
    const recordRow = recordMap.get(entry.username);
    return recordRow ? mapAttendanceRecord(recordRow) : buildEmptyRecord(workDate, entry.username, entry.displayName);
  });

  const effectiveSettings = departmentId === undefined ? settings : applyDepartmentSettings(settings, departmentId);
  const currentPeriod = getCurrentPeriod(effectiveSettings, new Date(), scheduledUsers);
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
export async function saveSupabaseRosterControls(input: AdminRosterControlInput): Promise<{ ok: boolean; message: string }> {
  const client = getSupabaseAdminClient();
  const existingRows = await getSupabaseRosterEntries(input.workDate);
  const existingMap = new Map(existingRows.map((row) => [String(row.username), row]));

  const payload = input.entries.map((entry) => {
    const existing = existingMap.get(entry.username);

    return {
      work_date: input.workDate,
      username: entry.username,
      is_scheduled: existing ? Boolean(existing.is_scheduled) : true,
      source_row_key: existing?.source_row_key ? String(existing.source_row_key) : null,
      synced_at: existing?.synced_at ? String(existing.synced_at) : new Date().toISOString(),
      shift_type: entry.shiftType,
      allow_lunch_out: entry.allowLunchOut,
    };
  });

  const { error } = await client.from(TABLES.rosters).upsert(payload, {
    onConflict: "work_date,username",
  });

  if (error) {
    const message = String(error.message ?? "");

    if (/column .* does not exist/i.test(message) || /schema cache/i.test(message)) {
      return {
        ok: false,
        message: "Supabase 데이터베이스 구조 업데이트가 필요합니다. migration SQL을 먼저 실행하세요.",
      };
    }

    throw error;
  }

  return {
    ok: true,
    message: "오늘 근무자 설정을 저장했습니다.",
  };
}

export async function saveSupabaseRosterEntry(input: AdminRosterEntryInput): Promise<{ ok: boolean; message: string }> {
  const client = getSupabaseAdminClient();

  const sourceRowKey = encodeRosterSourceKey("admin", input.reasonCode);

  const { error } = await client.from(TABLES.rosters).upsert(
    {
      work_date: input.workDate,
      username: input.username,
      is_scheduled: input.isScheduled,
      shift_type: input.shiftType,
      allow_lunch_out: false,
      source_row_key: sourceRowKey,
      synced_at: new Date().toISOString(),
    },
    { onConflict: "work_date,username" },
  );

  if (error) {
    throw error;
  }

  return { ok: true, message: "근태 설정을 저장했습니다." };
}

export async function performSupabaseAttendanceAction(input: {
  username: string;
  action: AttendanceAction;
  zoneId: string;
  zoneCheckResult: ZoneCheckResult;
  accuracyCheckResult: AccuracyCheckResult;
  mdmVerified?: boolean;
  cameraTestResult?: string | null;
  sessionUser?: SessionUser;
}): Promise<AttendanceMutationResult> {
  const workDate = getKoreaDateKey();
  const [zones, settings, rosterRow, currentRecordRow] = await Promise.all([
    getSupabaseZones(),
    getSupabaseSettings(),
    getSupabaseRosterEntryForUser(workDate, input.username),
    getSupabaseAttendanceRecordRow(workDate, input.username),
  ]);

  const sessionUser = input.sessionUser ?? (await getSupabaseSessionUser(input.username));

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

  const rosterEntry = rosterRow
    ? mapRosterEntry(rosterRow, sessionUser.displayName)
    : {
        id: `${workDate}-${input.username}`,
        workDate,
        username: input.username,
        displayName: sessionUser.displayName,
        isScheduled: false,
        shiftType: "day" as const,
        allowLunchOut: false,
        scheduleReasonCode: "not_synced" as const,
        scheduleReason: getRosterReasonMessage("not_synced"),
      };
  const mappedRecord = currentRecordRow ? mapAttendanceRecord(currentRecordRow) : null;
  const effectiveSettings = applyDepartmentSettings(settings, sessionUser.departmentId);

  const validation = validateAttendanceMutation({
    action: input.action,
    zoneId: input.zoneId,
    zoneCheckResult: input.zoneCheckResult,
    accuracyCheckResult: input.accuracyCheckResult,
    rosterEntry,
    record: mappedRecord,
    zones,
    settings: effectiveSettings,
  });

  if (!validation.ok || !validation.zoneId || !validation.eventCode) {
    return validation;
  }

  const point = {
    occurredAt: new Date().toISOString(),
    latitude: 0,
    longitude: 0,
    accuracyM: 0,
    zoneId: validation.zoneId,
  } satisfies AttendancePoint;

  const result = await persistAttendanceEvent({
    workDate,
    username: input.username,
    displayName: sessionUser.displayName,
    eventCode: validation.eventCode,
    point,
    currentRecord: mappedRecord,
    validationMessage: validation.message,
    mdmVerified: input.mdmVerified,
    cameraTestResult: input.cameraTestResult,
  });

  if (result.ok && result.record) {
    result.eventStates = filterEventStatesForDepartment(
      buildEventStates({
        shiftType: rosterEntry.shiftType,
        rosterEntry,
        record: result.record,
        settings: effectiveSettings,
      }),
      sessionUser.departmentCode,
    );
  }

  return result;
}

function toAdminCorrectedPoint(nextOccurredAt: string | null, currentPoint: AttendancePoint | null): AttendancePoint | null {
  if (!nextOccurredAt) {
    return null;
  }

  return {
    occurredAt: nextOccurredAt,
    latitude: 0,
    longitude: 0,
    accuracyM: 0,
    zoneId: currentPoint?.zoneId ?? "",
  };
}

function sanitizeAttendancePointForAudit(point: AttendancePoint | null): Pick<AttendancePoint, "occurredAt" | "zoneId"> | null {
  if (!point) {
    return null;
  }

  return {
    occurredAt: point.occurredAt,
    zoneId: point.zoneId,
  };
}

function sanitizeAttendanceRecordForAudit(record: AttendanceRecord | null) {
  if (!record) {
    return null;
  }

  return {
    ...record,
    checkIn: sanitizeAttendancePointForAudit(record.checkIn),
    tbm: sanitizeAttendancePointForAudit(record.tbm),
    tbmMorning: sanitizeAttendancePointForAudit(record.tbmMorning),
    lunchRegister: sanitizeAttendancePointForAudit(record.lunchRegister),
    lunchOut: sanitizeAttendancePointForAudit(record.lunchOut),
    lunchIn: sanitizeAttendancePointForAudit(record.lunchIn),
    tbmAfternoon: sanitizeAttendancePointForAudit(record.tbmAfternoon),
    tbmCheckout: sanitizeAttendancePointForAudit(record.tbmCheckout),
    checkOut: sanitizeAttendancePointForAudit(record.checkOut),
  };
}

export async function correctSupabaseAttendanceRecord(
  input: AdminAttendanceCorrectionInput,
  actorName: string,
): Promise<{ ok: boolean; message: string }> {
  const client = getSupabaseAdminClient();
  const [userResult, existingResult] = await Promise.all([
    client
      .from(TABLES.users)
      .select("username, display_name, is_active")
      .eq("username", input.username)
      .maybeSingle(),
    client
      .from(TABLES.attendanceDailyRecords)
      .select("*")
      .eq("work_date", input.workDate)
      .eq("username", input.username)
      .maybeSingle(),
  ]);

  if (userResult.error) {
    throw userResult.error;
  }

  if (existingResult.error) {
    throw existingResult.error;
  }

  if (!userResult.data || !userResult.data.is_active) {
    return {
      ok: false,
      message: "정정할 사용자를 찾을 수 없습니다.",
    };
  }

  const previousRecord = existingResult.data ? mapAttendanceRecord(existingResult.data) : null;
  const nextRecord = previousRecord ?? buildEmptyRecord(input.workDate, input.username, userResult.data.display_name);

  nextRecord.checkIn = toAdminCorrectedPoint(input.checkInAt, nextRecord.checkIn);
  nextRecord.tbm = toAdminCorrectedPoint(input.tbmAt, nextRecord.tbm);
  nextRecord.tbmMorning = toAdminCorrectedPoint(input.tbmAt, nextRecord.tbmMorning ?? nextRecord.tbm);
  nextRecord.checkOut = toAdminCorrectedPoint(input.checkOutAt, nextRecord.checkOut);
  nextRecord.correctedByAdmin = true;
  nextRecord.correctionNote = input.reason;
  nextRecord.updatedAt = new Date().toISOString();

  const payload = {
    work_date: nextRecord.workDate,
    username: nextRecord.username,
    display_name: nextRecord.displayName,
    check_in_at: nextRecord.checkIn?.occurredAt ?? null,
    check_in_lat: null,
    check_in_lng: null,
    check_in_accuracy_m: null,
    check_in_zone_id: nextRecord.checkIn?.zoneId || null,
    tbm_at: nextRecord.tbm?.occurredAt ?? null,
    tbm_lat: null,
    tbm_lng: null,
    tbm_accuracy_m: null,
    tbm_zone_id: nextRecord.tbm?.zoneId || null,
    tbm_morning_at: nextRecord.tbmMorning?.occurredAt ?? null,
    tbm_morning_lat: null,
    tbm_morning_lng: null,
    tbm_morning_accuracy_m: null,
    tbm_morning_zone_id: nextRecord.tbmMorning?.zoneId || null,
    lunch_register_at: nextRecord.lunchRegister?.occurredAt ?? null,
    lunch_register_lat: null,
    lunch_register_lng: null,
    lunch_register_accuracy_m: null,
    lunch_register_zone_id: nextRecord.lunchRegister?.zoneId || null,
    check_out_at: nextRecord.checkOut?.occurredAt ?? null,
    check_out_lat: null,
    check_out_lng: null,
    check_out_accuracy_m: null,
    check_out_zone_id: nextRecord.checkOut?.zoneId || null,
    corrected_by_admin: true,
    correction_note: input.reason,
    updated_at: nextRecord.updatedAt,
  };

  let savedRow: Record<string, unknown> | null = null;

  if (existingResult.data) {
    if (!input.expectedUpdatedAt) {
      return {
        ok: false,
        message: "기록 버전 정보가 없습니다. 새로고침 후 다시 시도하세요.",
      };
    }

    const { data, error: updateError } = await client
      .from(TABLES.attendanceDailyRecords)
      .update(payload)
      .eq("id", existingResult.data.id)
      .eq("updated_at", input.expectedUpdatedAt)
      .select("*")
      .maybeSingle();

    if (updateError) {
      throw updateError;
    }

    if (!data) {
      return {
        ok: false,
        message: "다른 세션에서 이 기록을 먼저 변경했습니다. 새로고침 후 다시 시도하세요.",
      };
    }

    savedRow = data;
  } else {
    const { data, error: insertError } = await client.from(TABLES.attendanceDailyRecords).insert(payload).select("*").maybeSingle();

    if (insertError) {
      if (isUniqueViolation(insertError)) {
        return {
          ok: false,
          message: "다른 세션에서 이 기록을 먼저 변경했습니다. 새로고침 후 다시 시도하세요.",
        };
      }

      throw insertError;
    }

    if (!data) {
      return {
        ok: false,
        message: "기록 정정 결과를 확인할 수 없습니다. 새로고침 후 다시 시도하세요.",
      };
    }

    savedRow = data;
  }

  if (!savedRow) {
    return {
      ok: false,
      message: "기록 정정 결과를 확인할 수 없습니다. 새로고침 후 다시 시도하세요.",
    };
  }

  const { error: auditError } = await client.from(TABLES.auditAttendanceLogs).insert({
    target_record_id: savedRow.id,
    action_type: "admin_correction",
    before_json: sanitizeAttendanceRecordForAudit(previousRecord),
    after_json: sanitizeAttendanceRecordForAudit(mapAttendanceRecord(savedRow)),
    reason: input.reason,
    actor_name: actorName,
  });

  if (auditError) {
    throw auditError;
  }

  return {
    ok: true,
    message: "기록을 정정하고 변경 이력을 저장했습니다.",
  };
}
function buildAttendanceWindowPayload(department: DepartmentAttendanceSettings) {
  const dayShift = department.dayShift;
  const lateShift = department.lateShift;
  const weekendShift = department.weekendShift ?? department.dayShift;
  const tbmMorningWindow = dayShift.tbmMorningWindow ?? dayShift.checkInWindow;
  const dayLunchOutWindow = dayShift.lunchOutWindow ?? { start: "11:40", end: "13:30" };
  const dayLunchInWindow = dayShift.lunchInWindow ?? dayLunchOutWindow;
  const tbmAfternoonWindow = dayShift.tbmAfternoonWindow ?? { start: "13:35", end: "13:45" };
  const tbmCheckoutWindow = dayShift.tbmCheckoutWindow ?? { start: "16:30", end: "16:45" };
  const lateLunchOutWindow = lateShift.lunchOutWindow ?? { start: "13:50", end: "15:40" };
  const lateLunchInWindow = lateShift.lunchInWindow ?? lateLunchOutWindow;
  const weekendLunchOutWindow = weekendShift.lunchOutWindow ?? DEFAULT_WEEKEND_LUNCH_OUT_WINDOW;
  const weekendLunchInWindow = weekendShift.lunchInWindow ?? weekendLunchOutWindow;

  return [
    {
      department_id: department.id,
      shift_type: "day",
      action_type: "check_in",
      window_start: dayShift.checkInWindow.start,
      window_end: dayShift.checkInWindow.end,
      is_enabled: true,
      sort_order: 10,
    },
    {
      department_id: department.id,
      shift_type: "day",
      action_type: "tbm_morning",
      window_start: tbmMorningWindow.start,
      window_end: tbmMorningWindow.end,
      is_enabled: true,
      sort_order: 20,
    },
    {
      department_id: department.id,
      shift_type: "day",
      action_type: "lunch_register",
      window_start: dayLunchOutWindow.start,
      window_end: dayLunchOutWindow.end,
      is_enabled: true,
      sort_order: 25,
    },
    {
      department_id: department.id,
      shift_type: "day",
      action_type: "lunch_out",
      window_start: dayLunchOutWindow.start,
      window_end: dayLunchOutWindow.end,
      is_enabled: true,
      sort_order: 26,
    },
    {
      department_id: department.id,
      shift_type: "day",
      action_type: "lunch_in",
      window_start: dayLunchInWindow.start,
      window_end: dayLunchInWindow.end,
      is_enabled: true,
      sort_order: 27,
    },
    {
      department_id: department.id,
      shift_type: "day",
      action_type: "tbm_afternoon",
      window_start: tbmAfternoonWindow.start,
      window_end: tbmAfternoonWindow.end,
      is_enabled: true,
      sort_order: 30,
    },
    {
      department_id: department.id,
      shift_type: "day",
      action_type: "tbm_checkout",
      window_start: tbmCheckoutWindow.start,
      window_end: tbmCheckoutWindow.end,
      is_enabled: true,
      sort_order: 40,
    },
    {
      department_id: department.id,
      shift_type: "day",
      action_type: "check_out",
      window_start: dayShift.checkOutWindow.start,
      window_end: dayShift.checkOutWindow.end,
      is_enabled: true,
      sort_order: 50,
    },
    {
      department_id: department.id,
      shift_type: "late",
      action_type: "check_in",
      window_start: lateShift.checkInWindow.start,
      window_end: lateShift.checkInWindow.end,
      is_enabled: true,
      sort_order: 10,
    },
    {
      department_id: department.id,
      shift_type: "late",
      action_type: "lunch_register",
      window_start: lateLunchOutWindow.start,
      window_end: lateLunchOutWindow.end,
      is_enabled: true,
      sort_order: 20,
    },
    {
      department_id: department.id,
      shift_type: "late",
      action_type: "lunch_out",
      window_start: lateLunchOutWindow.start,
      window_end: lateLunchOutWindow.end,
      is_enabled: true,
      sort_order: 21,
    },
    {
      department_id: department.id,
      shift_type: "late",
      action_type: "lunch_in",
      window_start: lateLunchInWindow.start,
      window_end: lateLunchInWindow.end,
      is_enabled: true,
      sort_order: 22,
    },
    {
      department_id: department.id,
      shift_type: "late",
      action_type: "check_out",
      window_start: lateShift.checkOutWindow.start,
      window_end: lateShift.checkOutWindow.end,
      is_enabled: true,
      sort_order: 30,
    },
    {
      department_id: department.id,
      shift_type: "weekend",
      action_type: "check_in",
      window_start: weekendShift.checkInWindow.start,
      window_end: weekendShift.checkInWindow.end,
      is_enabled: true,
      sort_order: 10,
    },
    {
      department_id: department.id,
      shift_type: "weekend",
      action_type: "lunch_register",
      window_start: weekendLunchOutWindow.start,
      window_end: weekendLunchOutWindow.end,
      is_enabled: true,
      sort_order: 20,
    },
    {
      department_id: department.id,
      shift_type: "weekend",
      action_type: "lunch_out",
      window_start: weekendLunchOutWindow.start,
      window_end: weekendLunchOutWindow.end,
      is_enabled: true,
      sort_order: 21,
    },
    {
      department_id: department.id,
      shift_type: "weekend",
      action_type: "lunch_in",
      window_start: weekendLunchInWindow.start,
      window_end: weekendLunchInWindow.end,
      is_enabled: true,
      sort_order: 22,
    },
    {
      department_id: department.id,
      shift_type: "weekend",
      action_type: "check_out",
      window_start: weekendShift.checkOutWindow.start,
      window_end: weekendShift.checkOutWindow.end,
      is_enabled: true,
      sort_order: 30,
    },
  ];
}

async function upsertSupabaseAttendanceWindows(
  departmentSettings: DepartmentAttendanceSettings[],
): Promise<void> {
  const payload = departmentSettings.flatMap(buildAttendanceWindowPayload);

  if (payload.length === 0) {
    return;
  }

  const client = getSupabaseAdminClient();
  const { error } = await client.from(TABLES.attendanceWindows).upsert(payload, {
    onConflict: "department_id,shift_type,action_type",
  });

  if (error) {
    throw error;
  }
}

export async function saveSupabaseAdminConfiguration(
  input: { settings: AppSettings; zones: Zone[] },
  actorRole: "master" | "admin" | "sub_admin" | "user",
  actorDepartmentId: string | null,
): Promise<{ ok: boolean; message: string }> {
  const client = getSupabaseAdminClient();

  if (actorRole !== "master" && actorRole !== "admin") {
    return { ok: false, message: "운영 설정을 저장할 권한이 없습니다." };
  }

  if (actorRole === "admin" && !actorDepartmentId) {
    return { ok: false, message: "소속 부서가 지정되지 않아 운영 설정을 저장할 수 없습니다." };
  }

  // 부서 admin: 자기 부서 시간 설정만 config_department_settings에 저장
  if (actorRole === "admin" && actorDepartmentId) {
    const deptSetting = input.settings.departmentSettings.find((d) => d.id === actorDepartmentId);

    if (!deptSetting) {
      return { ok: false, message: "부서 설정 정보를 찾을 수 없습니다." };
    }

    const { error } = await client
      .from(TABLES.departmentSettings)
      .update({
        day_check_in_start: deptSetting.dayShift.checkInWindow.start,
        day_check_in_end: deptSetting.dayShift.checkInWindow.end,
        day_tbm_start: deptSetting.dayShift.tbmMorningWindow?.start ?? deptSetting.dayShift.checkInWindow.start,
        day_tbm_end: deptSetting.dayShift.tbmMorningWindow?.end ?? deptSetting.dayShift.checkInWindow.end,
        day_tbm_afternoon_start: deptSetting.dayShift.tbmAfternoonWindow?.start ?? "13:35",
        day_tbm_afternoon_end: deptSetting.dayShift.tbmAfternoonWindow?.end ?? "13:45",
        day_tbm_checkout_start: deptSetting.dayShift.tbmCheckoutWindow?.start ?? "16:30",
        day_tbm_checkout_end: deptSetting.dayShift.tbmCheckoutWindow?.end ?? "16:45",
        day_check_out_start: deptSetting.dayShift.checkOutWindow.start,
        day_check_out_end: deptSetting.dayShift.checkOutWindow.end,
        late_check_in_start: deptSetting.lateShift.checkInWindow.start,
        late_check_in_end: deptSetting.lateShift.checkInWindow.end,
        late_check_out_start: deptSetting.lateShift.checkOutWindow.start,
        late_check_out_end: deptSetting.lateShift.checkOutWindow.end,
        updated_at: new Date().toISOString(),
      })
      .eq("department_id", actorDepartmentId);

    if (error) {
      throw error;
    }

    await upsertSupabaseAttendanceWindows([deptSetting]);

    return { ok: true, message: "부서 시간 설정을 저장했습니다." };
  }

  // 전역 admin: config_global_settings + 모든 config_department_settings + geo_zones 저장
  const { data: latestSettingsRow, error: settingsLookupError } = await client
    .from(TABLES.globalSettings)
    .select("id, google_sheet_id, google_sheet_tab_name")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (settingsLookupError) {
    throw settingsLookupError;
  }

  const settingsPayload = {
    check_in_start: input.settings.checkInWindow.start,
    check_in_end: input.settings.checkInWindow.end,
    tbm_start: input.settings.tbmWindow.start,
    tbm_end: input.settings.tbmWindow.end,
    tbm_afternoon_start: input.settings.tbmAfternoonWindow.start,
    tbm_afternoon_end: input.settings.tbmAfternoonWindow.end,
    tbm_checkout_start: input.settings.tbmCheckoutWindow.start,
    tbm_checkout_end: input.settings.tbmCheckoutWindow.end,
    check_out_start: input.settings.checkOutWindow.start,
    check_out_end: input.settings.checkOutWindow.end,
    late_check_in_start: input.settings.lateCheckInWindow.start,
    late_check_in_end: input.settings.lateCheckInWindow.end,
    late_check_out_start: input.settings.lateCheckOutWindow.start,
    late_check_out_end: input.settings.lateCheckOutWindow.end,
    max_gps_accuracy_m: input.settings.maxGpsAccuracyM,
    google_sheet_id: latestSettingsRow?.google_sheet_id ?? null,
    google_sheet_tab_name: latestSettingsRow?.google_sheet_tab_name ?? "Roster",
  };

  if (latestSettingsRow?.id) {
    const { error } = await client.from(TABLES.globalSettings).update(settingsPayload).eq("id", latestSettingsRow.id);

    if (error) {
      throw error;
    }
  } else {
    const { error } = await client.from(TABLES.globalSettings).insert(settingsPayload);

    if (error) {
      throw error;
    }
  }

  // 전역 admin: 모든 부서 설정 저장
  for (const deptSetting of input.settings.departmentSettings) {
    const { error } = await client
      .from(TABLES.departmentSettings)
      .update({
        day_check_in_start: deptSetting.dayShift.checkInWindow.start,
        day_check_in_end: deptSetting.dayShift.checkInWindow.end,
        day_tbm_start: deptSetting.dayShift.tbmMorningWindow?.start ?? deptSetting.dayShift.checkInWindow.start,
        day_tbm_end: deptSetting.dayShift.tbmMorningWindow?.end ?? deptSetting.dayShift.checkInWindow.end,
        day_tbm_afternoon_start: deptSetting.dayShift.tbmAfternoonWindow?.start ?? "13:35",
        day_tbm_afternoon_end: deptSetting.dayShift.tbmAfternoonWindow?.end ?? "13:45",
        day_tbm_checkout_start: deptSetting.dayShift.tbmCheckoutWindow?.start ?? "16:30",
        day_tbm_checkout_end: deptSetting.dayShift.tbmCheckoutWindow?.end ?? "16:45",
        day_check_out_start: deptSetting.dayShift.checkOutWindow.start,
        day_check_out_end: deptSetting.dayShift.checkOutWindow.end,
        late_check_in_start: deptSetting.lateShift.checkInWindow.start,
        late_check_in_end: deptSetting.lateShift.checkInWindow.end,
        late_check_out_start: deptSetting.lateShift.checkOutWindow.start,
        late_check_out_end: deptSetting.lateShift.checkOutWindow.end,
        updated_at: new Date().toISOString(),
      })
      .eq("department_id", deptSetting.id);

    if (error) {
      throw error;
    }
  }

  await upsertSupabaseAttendanceWindows(input.settings.departmentSettings);

  const zonePayload = input.zones.map((zone) => ({
    id: zoneIdPattern.test(zone.id) ? zone.id : randomUUID(),
    name: zone.name.trim(),
    type: zone.type,
    latitude: zone.latitude,
    longitude: zone.longitude,
    radius_m: zone.radiusM,
    is_active: zone.isActive,
  }));

  const { error: zoneError } = await client.from(TABLES.zones).upsert(zonePayload, {
    onConflict: "id",
  });

  if (zoneError) {
    throw zoneError;
  }

  const savedIds = zonePayload.map((z) => z.id);
  const { data: removedZoneRows, error: removedZoneLookupError } = await client
    .from(TABLES.zones)
    .select("id")
    .not("id", "in", `(${savedIds.join(",")})`);

  if (removedZoneLookupError) {
    throw removedZoneLookupError;
  }

  const removedZoneIds = (removedZoneRows ?? []).map((row) => String(row.id)).filter(Boolean);

  if (removedZoneIds.length > 0) {
    const dailyRecordZoneColumns = [
      "check_in_zone_id",
      "tbm_zone_id",
      "tbm_morning_zone_id",
      "lunch_register_zone_id",
      "lunch_out_zone_id",
      "lunch_in_zone_id",
      "tbm_afternoon_zone_id",
      "tbm_checkout_zone_id",
      "check_out_zone_id",
    ];

    for (const column of dailyRecordZoneColumns) {
      const { error } = await client
        .from(TABLES.attendanceDailyRecords)
        .update({ [column]: null })
        .in(column, removedZoneIds);

      if (error) {
        throw error;
      }
    }

    const { error: eventClearError } = await client
      .from(TABLES.attendanceEvents)
      .update({ zone_id: null })
      .in("zone_id", removedZoneIds);

    if (eventClearError) {
      throw eventClearError;
    }

    const { error: deleteError } = await client.from(TABLES.zones).delete().in("id", removedZoneIds);

    if (deleteError) {
      throw deleteError;
    }
  }

  return {
    ok: true,
    message: "운영 설정과 지점 정보를 저장했습니다.",
  };
}
export async function getSupabaseRosterSyncPreview(): Promise<RosterSyncPreview> {
  return buildSupabaseRosterSyncPreview(getKoreaDateKey());
}

export async function syncSupabaseRoster(): Promise<RosterSyncResult> {
  const workDate = getKoreaDateKey();
  const client = getSupabaseAdminClient();
  const [users, existingRows, preview] = await Promise.all([
    getSupabaseActiveUsers(),
    getSupabaseRosterEntries(workDate),
    buildSupabaseRosterSyncPreview(workDate),
  ]);
  const existingMap = new Map(existingRows.map((row) => [String(row.username), row]));
  const rosterSyncUsers = await buildRosterSyncUsers(users);
  const snapshot = await fetchSheetRosterSnapshot(
    workDate,
    rosterSyncUsers,
  );

  const payload = snapshot.assignments.map((assignment) => {
    const existing = existingMap.get(assignment.username);
    return {
      work_date: workDate,
      username: assignment.username,
      is_scheduled: assignment.isScheduled,
      shift_type: assignment.shiftType,
      allow_lunch_out: assignment.allowLunchOut || Boolean(existing?.allow_lunch_out),
      source_row_key: assignment.sourceKey,
      synced_at: new Date().toISOString(),
    };
  });

  const { error } = await client.from(TABLES.rosters).upsert(payload, {
    onConflict: "work_date,username",
  });

  if (error) {
    throw error;
  }

  const syncedCount = preview.summary.scheduledCount;
  const skippedCount = preview.unmatchedNames.length;

  return {
    ok: true,
    dataSource: "supabase",
    workDate,
    syncedCount,
    skippedCount,
    message:
      skippedCount > 0
        ? `${preview.sourceLabel} 근무표를 동기화했습니다. ${syncedCount}명 반영, ${skippedCount}명은 앱 사용자와 매칭되지 않았습니다.`
        : `${preview.sourceLabel} 근무표를 동기화했습니다. ${syncedCount}명 반영되었습니다.`,
  };
}
































