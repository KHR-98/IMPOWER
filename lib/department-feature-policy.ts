import type {
  ActionAvailability,
  AttendanceAction,
  AttendanceEventCode,
  AttendanceEventState,
  CurrentPeriodCode,
  CurrentPeriodStat,
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
