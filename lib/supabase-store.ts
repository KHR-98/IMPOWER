import "server-only";

import { randomUUID } from "node:crypto";
import { compareSync, hashSync } from "bcryptjs";

import { buildEventStates } from "@/lib/attendance-events";
import { buildCurrentPeriodStats, getCurrentPeriod } from "@/lib/current-period";
import { buildDepartmentAttendanceSettings, buildOperationalSettings, cloneShiftSettings } from "@/lib/attendance-schedule";
import { buildActionAvailability, validateAttendanceMutation } from "@/lib/attendance-rules";
import { fetchSheetRosterSnapshot, fetchSheetUserCandidates } from "@/lib/google-sheets";
import { encodeRosterSourceKey, getRosterReasonMessage, parseRosterReasonCodeFromSourceKey } from "@/lib/roster-reasons";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { getKoreaDateKey, getKoreaDateLabel } from "@/lib/time";
import type {
  AdminAttendanceCorrectionInput,
  AdminRosterControlInput,
  AdminRosterEntryInput,
  AdminUserImportInput,
  AdminUserListItem,
  AdminUserMutationInput,
  AppSettings,
  AttendanceAction,
  AttendanceEventCode,
  AttendanceMutationResult,
  AttendancePoint,
  AttendanceRecord,
  DashboardView,
  Department,
  DepartmentAttendanceSettings,
  RosterEntry,
  RosterSyncPreview,
  RosterSyncResult,
  SessionUser,
  SheetUserImportPreview,
  UserTodayView,
  UserRole,
  Zone,
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

const defaultSettings: AppSettings = buildOperationalSettings(100);

const zoneIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function mapRosterEntry(row: Record<string, unknown>, displayName: string): RosterEntry {
  const scheduleReasonCode = parseRosterReasonCodeFromSourceKey(row.source_row_key ? String(row.source_row_key) : null);

  return {
    id: String(row.id),
    workDate: String(row.work_date),
    username: String(row.username),
    displayName,
    isScheduled: Boolean(row.is_scheduled),
    shiftType: row.shift_type === "late" ? "late" : "day",
    allowLunchOut: Boolean(row.allow_lunch_out),
    scheduleReasonCode,
    scheduleReason: scheduleReasonCode ? getRosterReasonMessage(scheduleReasonCode) : null,
  };
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeUserRole(value: unknown): UserRole {
  return value === "admin" || value === "sub_admin" ? value : "user";
}

function mapDepartment(row: Record<string, unknown>): Department {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    isActive: Boolean(row.is_active),
  };
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
    [`${prefix}_lat`]: point.latitude,
    [`${prefix}_lng`]: point.longitude,
    [`${prefix}_accuracy_m`]: point.accuracyM,
    [`${prefix}_zone_id`]: point.zoneId,
    updated_at: updatedAt,
  };

  if (eventCode === "tbm_morning") {
    payload.tbm_at = point.occurredAt;
    payload.tbm_lat = point.latitude;
    payload.tbm_lng = point.longitude;
    payload.tbm_accuracy_m = point.accuracyM;
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
    .from("attendance_records")
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
      .from("attendance_records")
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

    const { data, error } = await client.from("attendance_records").insert(insertPayload).select("*").maybeSingle();

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

async function buildSupabaseRosterSyncPreview(workDate: string): Promise<RosterSyncPreview> {
  const [users, existingRows] = await Promise.all([
    getSupabaseActiveUsers(),
    getSupabaseRosterEntries(workDate),
  ]);
  const existingMap = new Map(existingRows.map((row) => [String(row.username), row]));
  const snapshot = await fetchSheetRosterSnapshot(
    workDate,
    users.map((user) => ({
      username: user.username,
      displayName: user.display_name,
    })),
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
  const { error } = await client.from("users").select("username").limit(1);

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
    .from("users")
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
    .from("users")
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
    .from("users")
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
    .from("users")
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

export async function getSessionUserByKakaoId(kakaoId: string): Promise<SessionUser | null> {
  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from("users")
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

export async function createKakaoUser(kakaoId: string, displayName: string): Promise<SessionUser> {
  const client = getSupabaseAdminClient();
  const username = `kakao_${kakaoId}`;

  const { error } = await client.from("users").insert({
    username,
    display_name: displayName,
    password_hash: null,
    kakao_id: kakaoId,
    role: "user",
    is_active: true,
  });

  if (error) {
    throw error;
  }

  return {
    username,
    displayName,
    role: "user",
    departmentId: null,
    departmentCode: null,
    departmentName: null,
  };
}

export async function getSupabaseAdminUsers(): Promise<AdminUserListItem[]> {
  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from("users")
    .select("id, username, display_name, role, is_active, created_at, department_id")
    .order("role", { ascending: true })
    .order("display_name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapAdminUserListItem(row));
}

export async function saveSupabaseAdminUser(input: AdminUserMutationInput): Promise<{ ok: boolean; message: string }> {
  const client = getSupabaseAdminClient();

  if (input.mode === "create") {
    const { data: existingUser, error: existingUserError } = await client
      .from("users")
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

    const { error: insertError } = await client.from("users").insert({
      username: input.username,
      display_name: input.displayName,
      password_hash: hashSync(input.password ?? "", 10),
      role: input.role,
      is_active: input.isActive,
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
    .from("users")
    .select("username, role, is_active")
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

  const removingLastActiveAdmin =
    currentUser.role === "admin" &&
    currentUser.is_active &&
    (input.role !== "admin" || !input.isActive);

  if (removingLastActiveAdmin) {
    const { count, error: countError } = await client
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true);

    if (countError) {
      throw countError;
    }

    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        message: "마지막 활성 관리자 계정은 비활성화하거나 일반 사용자로 변경할 수 없습니다.",
      };
    }
  }

  const updatePayload: {
    display_name: string;
    role: "user" | "admin" | "sub_admin";
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

  const { error: updateError } = await client.from("users").update(updatePayload).eq("username", input.username);

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
  actorUsername: string,
): Promise<{ ok: boolean; message: string }> {
  const client = getSupabaseAdminClient();

  if (username === actorUsername) {
    return {
      ok: false,
      message: "현재 로그인한 계정은 직접 삭제할 수 없습니다.",
    };
  }

  const { data: currentUser, error: currentUserError } = await client
    .from("users")
    .select("username, role, is_active")
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

  if (currentUser.role === "admin" && currentUser.is_active) {
    const { count, error: countError } = await client
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_active", true);

    if (countError) {
      throw countError;
    }

    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        message: "마지막 활성 관리자 계정은 삭제할 수 없습니다.",
      };
    }
  }

  const { error: rosterDeleteError } = await client.from("roster_entries").delete().eq("username", username);
  if (rosterDeleteError) throw rosterDeleteError;

  const { error: deleteError } = await client.from("users").delete().eq("username", username);
  if (deleteError) {
    const msg = String(deleteError.message ?? "");
    if (/foreign key|violates/i.test(msg)) {
      return {
        ok: false,
        message: "출퇴근 기록 외래키 제약이 남아 있습니다. Supabase SQL 에디터에서 다음을 실행하세요: ALTER TABLE attendance_records DROP CONSTRAINT attendance_records_username_fkey;",
      };
    }
    throw deleteError;
  }

  return {
    ok: true,
    message: "계정을 삭제했습니다. 출퇴근 기록은 보존됩니다.",
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

  const { data: currentUsers, error: currentUsersError } = await client.from("users").select("username, display_name");

  if (currentUsersError) {
    throw currentUsersError;
  }

  const existingKeys = new Set<string>();

  for (const user of currentUsers ?? []) {
    existingKeys.add(normalizeUserLookupKey(String(user.username ?? "")));
    existingKeys.add(normalizeUserLookupKey(String(user.display_name ?? "")));
  }

  const rows = selectedNames
    .filter((name) => !existingKeys.has(normalizeUserLookupKey(name)))
    .map((name) => ({
      username: name,
      display_name: name,
      password_hash: hashSync(input.password, 10),
      role: "user" as const,
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

  const { error: insertError } = await client.from("users").insert(rows);

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

export async function getSupabaseZones(): Promise<Zone[]> {
  const client = getSupabaseAdminClient();
  const { data, error } = await client.from("zones").select("*").order("name");

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapZone(row));
}

export async function getSupabaseSettings(): Promise<AppSettings> {
  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from("app_settings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return defaultSettings;
  }

  const settings = buildOperationalSettings(Number(data.max_gps_accuracy_m ?? defaultSettings.maxGpsAccuracyM));

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

  settings.dayShift.checkInWindow = { ...settings.checkInWindow };
  settings.dayShift.tbmMorningWindow = { ...settings.tbmWindow };
  settings.dayShift.tbmAfternoonWindow = { ...settings.tbmAfternoonWindow };
  settings.dayShift.tbmCheckoutWindow = { ...settings.tbmCheckoutWindow };
  settings.dayShift.checkOutWindow = { ...settings.checkOutWindow };

  settings.lateShift.checkInWindow = { ...settings.lateCheckInWindow };
  settings.lateShift.checkOutWindow = { ...settings.lateCheckOutWindow };

  const { data: deptRows } = await client
    .from("departments")
    .select("id, code, name, is_active")
    .eq("is_active", true)
    .order("name");

  const departments: Department[] = (deptRows ?? []).map(mapDepartment);

  if (departments.length > 0) {
    const { data: deptSettingsRows } = await client
      .from("department_settings")
      .select("*")
      .in("department_id", departments.map((d) => d.id));

    const deptSettingsMap = new Map(
      (deptSettingsRows ?? []).map((row) => [String(row.department_id), row as Record<string, unknown>]),
    );

    settings.departmentSettings = departments.map((dept) =>
      mergeDepartmentShiftSettings(deptSettingsMap.get(dept.id) ?? null, dept, settings),
    );
  }

  return settings;
}

async function getSupabaseRosterEntries(workDate: string) {
  const client = getSupabaseAdminClient();
  const { data, error } = await client.from("roster_entries").select("*").eq("work_date", workDate);

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function getSupabaseRosterEntryForUser(workDate: string, username: string) {
  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from("roster_entries")
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
  const { data, error } = await client.from("attendance_records").select("*").eq("work_date", workDate);

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function getSupabaseActiveUsers() {
  const client = getSupabaseAdminClient();
  const { data, error } = await client
    .from("users")
    .select("username, display_name, role, is_active")
    .eq("is_active", true)
    .order("display_name");

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
    : user.role === "admin"
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
  const currentPeriod = getCurrentPeriod(effectiveSettings);

  return {
    dateKey: workDate,
    dateLabel: getKoreaDateLabel(),
    user,
    isScheduled: rosterEntry.isScheduled,
    shiftType,
    currentPeriod,
    record,
    actionStates: [
      buildActionAvailability("check-in", rosterEntry, record, effectiveSettings),
      buildActionAvailability("tbm", rosterEntry, record, effectiveSettings),
      buildActionAvailability("lunch-register", rosterEntry, record, effectiveSettings),
      buildActionAvailability("lunch-out", rosterEntry, record, effectiveSettings),
      buildActionAvailability("lunch-in", rosterEntry, record, effectiveSettings),
      buildActionAvailability("check-out", rosterEntry, record, effectiveSettings),
    ],
    eventStates: buildEventStates({
      shiftType,
      rosterEntry,
      record,
      settings,
    }),
  };
}

export async function getSupabaseDashboardView(): Promise<DashboardView> {
  const workDate = getKoreaDateKey();
  const [users, zones, settings, rosterRows, recordRows] = await Promise.all([
    getSupabaseActiveUsers(),
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
      shiftType: rosterRow?.shift_type === "late" ? "late" : "day",
      allowLunchOut: Boolean(rosterRow?.allow_lunch_out),
      scheduleReasonCode,
      scheduleReason: scheduleReasonCode ? getRosterReasonMessage(scheduleReasonCode) : null,
    } satisfies RosterEntry;
  });

  const rows = scheduledUsers.map((entry) => {
    const recordRow = recordMap.get(entry.username);
    return recordRow ? mapAttendanceRecord(recordRow) : buildEmptyRecord(workDate, entry.username, entry.displayName);
  });

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

  const { error } = await client.from("roster_entries").upsert(payload, {
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

  const { error } = await client.from("roster_entries").upsert(
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
  latitude: number;
  longitude: number;
  accuracyM: number;
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

  const validation = validateAttendanceMutation({
    action: input.action,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracyM: input.accuracyM,
    rosterEntry,
    record: mappedRecord,
    zones,
    settings,
  });

  if (!validation.ok || !validation.zoneId || !validation.eventCode) {
    return validation;
  }

  const point = {
    occurredAt: new Date().toISOString(),
    latitude: input.latitude,
    longitude: input.longitude,
    accuracyM: input.accuracyM,
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
    result.eventStates = buildEventStates({
      shiftType: rosterEntry.shiftType,
      rosterEntry,
      record: result.record,
      settings,
    });
  }

  return result;
}

function toAdminCorrectedPoint(nextOccurredAt: string | null, currentPoint: AttendancePoint | null): AttendancePoint | null {
  if (!nextOccurredAt) {
    return null;
  }

  return {
    occurredAt: nextOccurredAt,
    latitude: currentPoint?.latitude ?? 0,
    longitude: currentPoint?.longitude ?? 0,
    accuracyM: currentPoint?.accuracyM ?? 0,
    zoneId: currentPoint?.zoneId ?? "",
  };
}

export async function correctSupabaseAttendanceRecord(
  input: AdminAttendanceCorrectionInput,
  actorName: string,
): Promise<{ ok: boolean; message: string }> {
  const client = getSupabaseAdminClient();
  const [userResult, existingResult] = await Promise.all([
    client
      .from("users")
      .select("username, display_name, is_active")
      .eq("username", input.username)
      .maybeSingle(),
    client
      .from("attendance_records")
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
    check_in_lat: nextRecord.checkIn ? nextRecord.checkIn.latitude : null,
    check_in_lng: nextRecord.checkIn ? nextRecord.checkIn.longitude : null,
    check_in_accuracy_m: nextRecord.checkIn ? nextRecord.checkIn.accuracyM : null,
    check_in_zone_id: nextRecord.checkIn?.zoneId || null,
    tbm_at: nextRecord.tbm?.occurredAt ?? null,
    tbm_lat: nextRecord.tbm ? nextRecord.tbm.latitude : null,
    tbm_lng: nextRecord.tbm ? nextRecord.tbm.longitude : null,
    tbm_accuracy_m: nextRecord.tbm ? nextRecord.tbm.accuracyM : null,
    tbm_zone_id: nextRecord.tbm?.zoneId || null,
    tbm_morning_at: nextRecord.tbmMorning?.occurredAt ?? null,
    tbm_morning_lat: nextRecord.tbmMorning ? nextRecord.tbmMorning.latitude : null,
    tbm_morning_lng: nextRecord.tbmMorning ? nextRecord.tbmMorning.longitude : null,
    tbm_morning_accuracy_m: nextRecord.tbmMorning ? nextRecord.tbmMorning.accuracyM : null,
    tbm_morning_zone_id: nextRecord.tbmMorning?.zoneId || null,
    lunch_register_at: nextRecord.lunchRegister?.occurredAt ?? null,
    lunch_register_lat: nextRecord.lunchRegister ? nextRecord.lunchRegister.latitude : null,
    lunch_register_lng: nextRecord.lunchRegister ? nextRecord.lunchRegister.longitude : null,
    lunch_register_accuracy_m: nextRecord.lunchRegister ? nextRecord.lunchRegister.accuracyM : null,
    lunch_register_zone_id: nextRecord.lunchRegister?.zoneId || null,
    check_out_at: nextRecord.checkOut?.occurredAt ?? null,
    check_out_lat: nextRecord.checkOut ? nextRecord.checkOut.latitude : null,
    check_out_lng: nextRecord.checkOut ? nextRecord.checkOut.longitude : null,
    check_out_accuracy_m: nextRecord.checkOut ? nextRecord.checkOut.accuracyM : null,
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
      .from("attendance_records")
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
    const { data, error: insertError } = await client.from("attendance_records").insert(payload).select("*").maybeSingle();

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

  const { error: auditError } = await client.from("audit_logs").insert({
    target_record_id: savedRow.id,
    action_type: "admin_correction",
    before_json: previousRecord,
    after_json: mapAttendanceRecord(savedRow),
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
export async function saveSupabaseAdminConfiguration(input: {
  settings: AppSettings;
  zones: Zone[];
}): Promise<{ ok: boolean; message: string }> {
  const client = getSupabaseAdminClient();
  const { data: latestSettingsRow, error: settingsLookupError } = await client
    .from("app_settings")
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
    const { error } = await client.from("app_settings").update(settingsPayload).eq("id", latestSettingsRow.id);

    if (error) {
      throw error;
    }
  } else {
    const { error } = await client.from("app_settings").insert(settingsPayload);

    if (error) {
      throw error;
    }
  }

  const zonePayload = input.zones.map((zone) => ({
    id: zoneIdPattern.test(zone.id) ? zone.id : randomUUID(),
    name: zone.name.trim(),
    type: zone.type,
    latitude: zone.latitude,
    longitude: zone.longitude,
    radius_m: zone.radiusM,
    is_active: zone.isActive,
  }));

  const { error: zoneError } = await client.from("zones").upsert(zonePayload, {
    onConflict: "id",
  });

  if (zoneError) {
    throw zoneError;
  }

  const savedIds = zonePayload.map((z) => z.id);
  const { error: deleteError } = await client
    .from("zones")
    .delete()
    .not("id", "in", `(${savedIds.join(",")})`);

  if (deleteError) {
    throw deleteError;
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
  const snapshot = await fetchSheetRosterSnapshot(
    workDate,
    users.map((user) => ({
      username: user.username,
      displayName: user.display_name,
    })),
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

  const { error } = await client.from("roster_entries").upsert(payload, {
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
































