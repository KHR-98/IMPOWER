import type {
  ActionAvailability,
  AppSettings,
  AttendanceAction,
  AttendanceEventCode,
  AttendanceEventState,
  CurrentPeriodCode,
  CurrentPeriodStat,
  DepartmentAttendanceSettings,
  ShiftAttendanceSettings,
  TimeWindow,
} from "@/lib/types";

const LUNCH_TBM_DISABLED_DEPARTMENT_CODES = new Set(["memory", "foundry_pcs"]);

const LUNCH_TBM_ACTIONS = new Set<AttendanceAction>(["tbm", "lunch-register", "lunch-out", "lunch-in"]);

const LUNCH_TBM_EVENT_CODES = new Set<AttendanceEventCode>([
  "tbm_morning",
  "lunch_register",
  "lunch_out",
  "lunch_in",
  "tbm_afternoon",
  "tbm_checkout",
]);

const LUNCH_TBM_ONLY_PERIOD_CODES = new Set<CurrentPeriodCode>([
  "lunch_day",
  "tbm_afternoon",
  "lunch_late",
  "lunch_weekend",
  "tbm_checkout",
]);

export const DEPARTMENT_FEATURE_DISABLED_MESSAGE = "해당 부서는 점심/TBM 기능을 사용하지 않습니다.";

export function departmentUsesLunchAndTbm(departmentCode?: string | null): boolean {
  return !departmentCode || !LUNCH_TBM_DISABLED_DEPARTMENT_CODES.has(departmentCode);
}

export function isLunchTbmSettingsKey(key: string): boolean {
  return (
    key === "tbmWindow" ||
    key === "lunchOutWindow" ||
    key === "lunchInWindow" ||
    key === "tbmAfternoonWindow" ||
    key === "tbmCheckoutWindow" ||
    key === "lateLunchOutWindow" ||
    key === "lateLunchInWindow"
  );
}

export function isAttendanceActionAllowedForDepartment(
  action: AttendanceAction,
  departmentCode?: string | null,
): boolean {
  return departmentUsesLunchAndTbm(departmentCode) || !LUNCH_TBM_ACTIONS.has(action);
}

export function filterActionStatesForDepartment<T extends ActionAvailability>(
  actionStates: T[],
  departmentCode?: string | null,
): T[] {
  if (departmentUsesLunchAndTbm(departmentCode)) {
    return actionStates;
  }

  return actionStates.filter((state) => !LUNCH_TBM_ACTIONS.has(state.action));
}

export function filterEventStatesForDepartment<T extends AttendanceEventState>(
  eventStates: T[],
  departmentCode?: string | null,
): T[] {
  if (departmentUsesLunchAndTbm(departmentCode)) {
    return eventStates;
  }

  return eventStates.filter((state) => !LUNCH_TBM_EVENT_CODES.has(state.code));
}

export function filterCurrentPeriodStatsForDepartment<T extends CurrentPeriodStat>(
  stats: T[],
  periodCode: CurrentPeriodCode,
  departmentCode?: string | null,
): T[] {
  if (departmentUsesLunchAndTbm(departmentCode)) {
    return stats;
  }

  if (LUNCH_TBM_ONLY_PERIOD_CODES.has(periodCode)) {
    return [];
  }

  if (periodCode !== "am") {
    return stats;
  }

  return stats.filter((stat) => !/TBM|점심/.test(stat.label));
}

export function filterLunchTbmLabels<T extends { label: string }>(
  items: T[],
  departmentCode?: string | null,
): T[] {
  if (departmentUsesLunchAndTbm(departmentCode)) {
    return items;
  }

  return items.filter((item) => !/TBM|점심/.test(item.label));
}

export function getDepartmentCurrentPeriodLabel(
  periodCode: CurrentPeriodCode,
  label: string,
  departmentCode?: string | null,
): string {
  if (departmentUsesLunchAndTbm(departmentCode)) {
    return label;
  }

  if (periodCode === "am") {
    return "주간조 출근";
  }

  if (LUNCH_TBM_ONLY_PERIOD_CODES.has(periodCode)) {
    return "현재 출결 현황";
  }

  return label;
}

function cloneWindow(window: TimeWindow | null): TimeWindow | null {
  return window ? { ...window } : null;
}

function preserveDisabledShiftLunchTbmWindows(
  next: ShiftAttendanceSettings,
  current: ShiftAttendanceSettings | null | undefined,
  fallback: AppSettings,
  shiftType: "day" | "late" | "weekend",
): ShiftAttendanceSettings {
  if (!current) {
    return next;
  }

  if (shiftType === "day") {
    return {
      ...next,
      tbmMorningWindow: cloneWindow(current.tbmMorningWindow),
      lunchOutWindow: cloneWindow(current.lunchOutWindow),
      lunchInWindow: cloneWindow(current.lunchInWindow),
      tbmAfternoonWindow: cloneWindow(current.tbmAfternoonWindow),
      tbmCheckoutWindow: cloneWindow(current.tbmCheckoutWindow),
    };
  }

  if (shiftType === "weekend") {
    return {
      ...next,
      tbmMorningWindow: cloneWindow(current.tbmMorningWindow),
      lunchOutWindow: cloneWindow(current.lunchOutWindow ?? fallback.weekendShift?.lunchOutWindow ?? null),
      lunchInWindow: cloneWindow(current.lunchInWindow ?? fallback.weekendShift?.lunchInWindow ?? null),
      tbmAfternoonWindow: cloneWindow(current.tbmAfternoonWindow),
      tbmCheckoutWindow: cloneWindow(current.tbmCheckoutWindow),
    };
  }

  return {
    ...next,
    lunchOutWindow: cloneWindow(current.lunchOutWindow),
    lunchInWindow: cloneWindow(current.lunchInWindow),
  };
}

export function preserveDisabledDepartmentLunchTbmSettings(
  nextDepartmentSettings: DepartmentAttendanceSettings[],
  currentDepartmentSettings: DepartmentAttendanceSettings[],
  fallbackSettings: AppSettings,
): DepartmentAttendanceSettings[] {
  const currentById = new Map(currentDepartmentSettings.map((department) => [department.id, department]));

  return nextDepartmentSettings.map((department) => {
    if (departmentUsesLunchAndTbm(department.code)) {
      return department;
    }

    const current = currentById.get(department.id);

    if (!current) {
      return department;
    }

    return {
      ...department,
      dayShift: preserveDisabledShiftLunchTbmWindows(department.dayShift, current.dayShift, fallbackSettings, "day"),
      lateShift: preserveDisabledShiftLunchTbmWindows(department.lateShift, current.lateShift, fallbackSettings, "late"),
      weekendShift: department.weekendShift
        ? preserveDisabledShiftLunchTbmWindows(
            department.weekendShift,
            current.weekendShift,
            fallbackSettings,
            "weekend",
          )
        : department.weekendShift,
    };
  });
}
