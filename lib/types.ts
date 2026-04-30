export type UserRole = "user" | "department_admin" | "admin";
export type ZoneType = "entry" | "tbm";
export type AttendanceAction = "check-in" | "tbm" | "lunch-register" | "lunch-out" | "lunch-in" | "check-out";
export type DataSourceKind = "demo" | "supabase";
export type ShiftType = "day" | "late";
export type RosterReasonCode =
  | "not_listed"
  | "sheet_missing"
  | "leave"
  | "half_day_am"
  | "half_day_pm"
  | "half_day"
  | "military"
  | "holiday"
  | "blocked"
  | "not_synced"
  | "not_scheduled";
export type CurrentPeriodCode =
  | "am"
  | "late_check_in"
  | "lunch_day"
  | "tbm_afternoon"
  | "lunch_late"
  | "tbm_checkout"
  | "day_checkout"
  | "late_checkout"
  | "none";
export type AttendanceEventCode =
  | "check_in"
  | "tbm_morning"
  | "lunch_register"
  | "lunch_out"
  | "lunch_in"
  | "tbm_afternoon"
  | "tbm_checkout"
  | "check_out";

export interface SessionUser {
  username: string;
  displayName: string;
  role: UserRole;
  departmentId: string | null;
  departmentCode: string | null;
  departmentName: string | null;
}

export interface UserAccount extends SessionUser {
  id: string;
  isActive: boolean;
  passwordHash: string;
}

export interface Zone {
  id: string;
  name: string;
  type: ZoneType;
  latitude: number;
  longitude: number;
  radiusM: number;
  isActive: boolean;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface AttendancePoint {
  occurredAt: string;
  latitude: number;
  longitude: number;
  accuracyM: number;
  zoneId: string;
}

export interface AttendanceRecord {
  id: string;
  workDate: string;
  username: string;
  displayName: string;
  checkIn: AttendancePoint | null;
  tbm: AttendancePoint | null;
  tbmMorning: AttendancePoint | null;
  lunchRegister: AttendancePoint | null;
  lunchOut: AttendancePoint | null;
  lunchIn: AttendancePoint | null;
  tbmAfternoon: AttendancePoint | null;
  tbmCheckout: AttendancePoint | null;
  checkOut: AttendancePoint | null;
  correctedByAdmin: boolean;
  correctionNote: string | null;
  updatedAt: string;
}

export interface RosterEntry {
  id: string;
  workDate: string;
  username: string;
  displayName: string;
  isScheduled: boolean;
  shiftType: ShiftType;
  allowLunchOut: boolean;
  scheduleReasonCode?: RosterReasonCode | null;
  scheduleReason?: string | null;
}

export interface TimeWindow {
  start: string;
  end: string;
}

export interface ShiftAttendanceSettings {
  checkInWindow: TimeWindow;
  tbmMorningWindow: TimeWindow | null;
  lunchOutWindow: TimeWindow | null;
  lunchInWindow: TimeWindow | null;
  tbmAfternoonWindow: TimeWindow | null;
  tbmCheckoutWindow: TimeWindow | null;
  checkOutWindow: TimeWindow;
  earlyCheckOutWindow: TimeWindow | null;
}

export interface AppSettings {
  checkInWindow: TimeWindow;
  tbmWindow: TimeWindow;
  tbmAfternoonWindow: TimeWindow;
  tbmCheckoutWindow: TimeWindow;
  checkOutWindow: TimeWindow;
  lateCheckInWindow: TimeWindow;
  lateCheckOutWindow: TimeWindow;
  dayShift: ShiftAttendanceSettings;
  lateShift: ShiftAttendanceSettings;
  maxGpsAccuracyM: number;
}

export interface ActionAvailability {
  action: AttendanceAction;
  label: string;
  available: boolean;
  reason: string;
}

export interface CurrentPeriodInfo {
  code: CurrentPeriodCode;
  label: string;
  description: string;
}

export interface CurrentPeriodStat {
  label: string;
  targetCount: number;
  completedCount: number;
  pendingCount: number;
}

export interface AttendanceEventState {
  code: AttendanceEventCode;
  label: string;
  action: AttendanceAction | null;
  zoneType: ZoneType;
  implemented: boolean;
  visible: boolean;
  available: boolean;
  reason: string;
  occurredAt: string | null;
}

export interface UserTodayView {
  dateKey: string;
  dateLabel: string;
  user: SessionUser;
  isScheduled: boolean;
  shiftType: ShiftType;
  currentPeriod: CurrentPeriodInfo;
  record: AttendanceRecord | null;
  actionStates: ActionAvailability[];
  eventStates: AttendanceEventState[];
}

export interface DashboardSummary {
  scheduledCount: number;
  checkedInCount: number;
  notCheckedInCount: number;
  tbmCompleteCount: number;
  tbmPendingCount: number;
  lunchRegisteredCount: number;
  lunchOutCount: number;
  lunchInCount: number;
  checkedOutCount: number;
  notCheckedOutCount: number;
}

export interface DashboardView {
  dateKey: string;
  dateLabel: string;
  currentPeriod: CurrentPeriodInfo;
  currentPeriodStats: CurrentPeriodStat[];
  summary: DashboardSummary;
  rows: AttendanceRecord[];
  scheduledUsers: RosterEntry[];
  zones: Zone[];
  settings: AppSettings;
}

export interface AttendanceMutationResult {
  ok: boolean;
  message: string;
  record?: AttendanceRecord;
  eventStates?: AttendanceEventState[];
}

export interface CoordinatePayload {
  latitude: number;
  longitude: number;
  accuracyM: number;
}

export interface DemoCredentials {
  username: string;
  password: string;
}

export interface RuntimeInfo {
  dataSource: DataSourceKind;
  persistenceLabel: string;
  rosterSyncConfigured: boolean;
  demoCredentials: {
    admin: DemoCredentials;
    user: DemoCredentials;
  } | null;
  setupMessage: string | null;
}

export interface RosterSyncResult {
  ok: boolean;
  dataSource: DataSourceKind;
  workDate: string;
  syncedCount: number;
  skippedCount: number;
  message: string;
}

export interface RosterSyncPreviewSummary {
  scheduledCount: number;
  dayShiftCount: number;
  lateShiftCount: number;
  excludedCount: number;
  lunchAllowedCount: number;
}

export interface RosterSyncPreview {
  dataSource: DataSourceKind;
  workDate: string;
  sourceMode: "legacy_gas" | "simple_table" | "monthly_matrix";
  sourceLabel: string;
  summary: RosterSyncPreviewSummary;
  rows: RosterEntry[];
  unmatchedNames: string[];
}

export interface RosterSyncUser {
  username: string;
  displayName: string;
  departmentId?: string | null;
}

export interface SheetRosterAssignment {
  sourceKey: string | null;
  workDate: string;
  username: string;
  matchedName: string | null;
  isScheduled: boolean;
  shiftType: ShiftType;
  allowLunchOut: boolean;
  scheduleReasonCode?: RosterReasonCode | null;
  scheduleReason?: string | null;
}

export interface SheetRosterSnapshot {
  mode: "legacy_gas" | "simple_table" | "monthly_matrix";
  workDate: string;
  assignments: SheetRosterAssignment[];
  unmatchedNames: string[];
}

export interface SheetUserCandidateSnapshot {
  mode: "legacy_gas" | "simple_table" | "monthly_matrix";
  names: string[];
}

export interface AdminUserListItem {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  departmentId: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface AdminUserMutationInput {
  mode: "create" | "update";
  username: string;
  displayName: string;
  role: UserRole;
  departmentId: string | null;
  isActive: boolean;
  password: string | null;
}

export interface SheetUserImportPreview {
  sourceMode: "legacy_gas" | "simple_table" | "monthly_matrix";
  sourceLabel: string;
  totalSheetNames: number;
  matchedCount: number;
  missingNames: string[];
}

export interface AdminUserImportInput {
  password: string;
  selectedNames?: string[];
}

export interface AdminAttendanceCorrectionInput {
  workDate: string;
  username: string;
  expectedUpdatedAt: string | null;
  checkInAt: string | null;
  tbmAt: string | null;
  checkOutAt: string | null;
  reason: string;
}

export interface AdminRosterControlInput {
  workDate: string;
  entries: Array<{
    username: string;
    shiftType: ShiftType;
    allowLunchOut: boolean;
  }>;
}

export interface AdminRosterEntryInput {
  workDate: string;
  username: string;
  displayName: string;
  isScheduled: boolean;
  shiftType: ShiftType;
  reasonCode: RosterReasonCode | null;
}





