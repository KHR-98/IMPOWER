import "server-only";

import {
  authenticateDemoUser,
  changeDemoPassword,
  getDashboardView as getDemoDashboardView,
  getDemoCredentials,
  getDevCoordinates,
  getSessionUser as getDemoSessionUser,
  getUserTodayView as getDemoUserTodayView,
  getZones as getDemoZones,
  performAttendanceAction as performDemoAttendanceAction,
} from "@/lib/demo-store";
import { hasGoogleSheetEnv, hasSupabaseEnv } from "@/lib/env";
import { getKoreaDateKey } from "@/lib/time";
import {
  authenticateSupabaseUser,
  changeSupabasePassword,
  correctSupabaseAttendanceRecord,
  createKakaoUser,
  deleteSupabaseAdminUser,
  getSessionUserByKakaoId,
  getSupabaseAdminUsers,
  getSupabaseDashboardView,
  getSupabaseSessionUser,
  getSupabaseSheetUserImportPreview,
  getSupabaseUserTodayView,
  getSupabaseZones,
  importSupabaseUsersFromSheet,
  performSupabaseAttendanceAction,
  saveSupabaseAdminConfiguration,
  saveSupabaseRosterControls,
  saveSupabaseRosterEntry,
  saveSupabaseAdminUser,
  syncSupabaseRoster,
} from "@/lib/supabase-store";
import type {
  AdminAttendanceCorrectionInput,
  AdminRosterControlInput,
  AdminRosterEntryInput,
  AdminUserImportInput,
  AdminUserListItem,
  AdminUserMutationInput,
  AppSettings,
  AttendanceAction,
  AttendanceMutationResult,
  CoordinatePayload,
  DashboardView,
  DataSourceKind,
  RosterSyncResult,
  RuntimeInfo,
  SessionUser,
  SheetUserImportPreview,
  UserTodayView,
  Zone,
} from "@/lib/types";

interface ResolvedDataSource {
  dataSource: DataSourceKind;
  setupMessage: string | null;
}

function resolveDataSource(): ResolvedDataSource {
  if (!hasSupabaseEnv()) {
    return { dataSource: "demo", setupMessage: null };
  }
  return { dataSource: "supabase", setupMessage: null };
}

export async function getDataSourceKind(): Promise<DataSourceKind> {
  return resolveDataSource().dataSource;
}

export async function getRuntimeInfo(): Promise<RuntimeInfo> {
  const resolved = resolveDataSource();

  return {
    dataSource: resolved.dataSource,
    persistenceLabel: resolved.dataSource === "supabase" ? "Supabase PostgreSQL" : "데모 메모리 저장소",
    rosterSyncConfigured: resolved.dataSource === "supabase" && hasGoogleSheetEnv(),
    demoCredentials: resolved.dataSource === "demo" ? getDemoCredentials() : null,
    setupMessage: resolved.setupMessage,
  };
}

export async function authenticateUser(username: string, password: string): Promise<SessionUser | null> {
  return resolveDataSource().dataSource === "supabase"
    ? authenticateSupabaseUser(username, password)
    : authenticateDemoUser(username, password);
}

export async function changePassword(input: {
  username: string;
  currentPassword: string;
  nextPassword: string;
}): Promise<{ ok: boolean; message: string }> {
  return resolveDataSource().dataSource === "supabase"
    ? changeSupabasePassword(input)
    : changeDemoPassword(input);
}

export async function getSessionUserByUsername(username: string): Promise<SessionUser | null> {
  return resolveDataSource().dataSource === "supabase"
    ? getSupabaseSessionUser(username)
    : getDemoSessionUser(username);
}

export async function findUserByKakaoId(kakaoId: string): Promise<SessionUser | null> {
  if (resolveDataSource().dataSource !== "supabase") return null;
  return getSessionUserByKakaoId(kakaoId);
}

export async function registerKakaoUser(kakaoId: string, displayName: string): Promise<SessionUser> {
  if (resolveDataSource().dataSource !== "supabase") {
    throw new Error("카카오 회원가입은 Supabase 모드에서만 지원됩니다.");
  }
  return createKakaoUser(kakaoId, displayName);
}

export async function getUserTodayView(username: string, sessionUser?: SessionUser): Promise<UserTodayView> {
  return resolveDataSource().dataSource === "supabase"
    ? getSupabaseUserTodayView(username, sessionUser)
    : getDemoUserTodayView(username);
}

export async function getDashboardView(): Promise<DashboardView> {
  return resolveDataSource().dataSource === "supabase" ? getSupabaseDashboardView() : getDemoDashboardView();
}

export async function getZones(): Promise<Zone[]> {
  return resolveDataSource().dataSource === "supabase" ? getSupabaseZones() : getDemoZones();
}

export async function getAdminUserList(): Promise<AdminUserListItem[]> {
  return resolveDataSource().dataSource === "supabase" ? getSupabaseAdminUsers() : [];
}

export async function performAttendanceAction(input: {
  username: string;
  action: AttendanceAction;
  latitude: number;
  longitude: number;
  accuracyM: number;
  mdmVerified?: boolean;
  cameraTestResult?: string | null;
  sessionUser?: SessionUser;
}): Promise<AttendanceMutationResult> {
  const { sessionUser, ...baseInput } = input;
  return resolveDataSource().dataSource === "supabase"
    ? performSupabaseAttendanceAction({ ...baseInput, sessionUser })
    : performDemoAttendanceAction(baseInput);
}

export async function syncRoster(): Promise<RosterSyncResult> {
  const resolved = resolveDataSource();

  if (resolved.dataSource !== "supabase") {
    return {
      ok: false,
      dataSource: "demo",
      workDate: getKoreaDateKey(),
      syncedCount: 0,
      skippedCount: 0,
      message: resolved.setupMessage ?? "데모 모드에서는 근무표 동기화를 지원하지 않습니다.",
    };
  }

  if (!hasGoogleSheetEnv()) {
    return {
      ok: false,
      dataSource: "supabase",
      workDate: getKoreaDateKey(),
      syncedCount: 0,
      skippedCount: 0,
      message: "Google Sheet 환경 변수가 설정되지 않았습니다.",
    };
  }

  return syncSupabaseRoster();
}

export async function saveAdminConfiguration(input: {
  settings: AppSettings;
  zones: Zone[];
}): Promise<{ ok: boolean; message: string }> {
  const resolved = resolveDataSource();

  if (resolved.dataSource !== "supabase") {
    return {
      ok: false,
      message: resolved.setupMessage ?? "현재 저장소에서는 관리자 설정을 저장할 수 없습니다.",
    };
  }

  return saveSupabaseAdminConfiguration(input);
}

export async function saveAdminUser(input: AdminUserMutationInput): Promise<{ ok: boolean; message: string }> {
  const resolved = resolveDataSource();

  if (resolved.dataSource !== "supabase") {
    return {
      ok: false,
      message: resolved.setupMessage ?? "현재 저장소에서는 사용자 계정을 저장할 수 없습니다.",
    };
  }

  return saveSupabaseAdminUser(input);
}

export async function deleteAdminUser(username: string, actorUsername: string): Promise<{ ok: boolean; message: string }> {
  const resolved = resolveDataSource();

  if (resolved.dataSource !== "supabase") {
    return {
      ok: false,
      message: resolved.setupMessage ?? "현재 저장소에서는 사용자 계정을 삭제할 수 없습니다.",
    };
  }

  return deleteSupabaseAdminUser(username, actorUsername);
}

export async function saveAdminRosterEntry(input: AdminRosterEntryInput): Promise<{ ok: boolean; message: string }> {
  const resolved = resolveDataSource();

  if (resolved.dataSource !== "supabase") {
    return {
      ok: false,
      message: resolved.setupMessage ?? "현재 저장소에서는 근태 설정을 저장할 수 없습니다.",
    };
  }

  return saveSupabaseRosterEntry(input);
}

export async function saveAdminRosterControls(input: AdminRosterControlInput): Promise<{ ok: boolean; message: string }> {
  const resolved = resolveDataSource();

  if (resolved.dataSource !== "supabase") {
    return {
      ok: false,
      message: resolved.setupMessage ?? "현재 저장소에서는 오늘 근무자 설정을 저장할 수 없습니다.",
    };
  }

  return saveSupabaseRosterControls(input);
}

export async function getSheetUserImportPreview(): Promise<SheetUserImportPreview | null> {
  const resolved = resolveDataSource();

  if (resolved.dataSource !== "supabase" || !hasGoogleSheetEnv()) {
    return null;
  }

  return getSupabaseSheetUserImportPreview();
}

export async function importUsersFromSheet(
  input: AdminUserImportInput,
): Promise<{ ok: boolean; message: string; createdCount: number; skippedCount: number }> {
  const resolved = resolveDataSource();

  if (resolved.dataSource !== "supabase") {
    return {
      ok: false,
      message: resolved.setupMessage ?? "현재 저장소에서는 시트 사용자 일괄 생성을 실행할 수 없습니다.",
      createdCount: 0,
      skippedCount: 0,
    };
  }

  if (!hasGoogleSheetEnv()) {
    return {
      ok: false,
      message: "Google Sheet 환경 변수가 설정되지 않았습니다.",
      createdCount: 0,
      skippedCount: 0,
    };
  }

  return importSupabaseUsersFromSheet(input);
}

export async function saveAdminAttendanceCorrection(
  input: AdminAttendanceCorrectionInput,
  actorName: string,
): Promise<{ ok: boolean; message: string }> {
  const resolved = resolveDataSource();

  if (resolved.dataSource !== "supabase") {
    return {
      ok: false,
      message: resolved.setupMessage ?? "현재 저장소에서는 기록 정정을 저장할 수 없습니다.",
    };
  }

  return correctSupabaseAttendanceRecord(input, actorName);
}

export async function getDevCoordinatesForTesting(): Promise<Partial<Record<AttendanceAction, CoordinatePayload>> | null> {
  return resolveDataSource().dataSource === "demo" ? getDevCoordinates() : null;
}












