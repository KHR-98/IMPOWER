import { isWithinWindow } from "@/lib/time";
import type {
  AppSettings,
  AttendancePoint,
  AttendanceRecord,
  CurrentPeriodCode,
  CurrentPeriodInfo,
  CurrentPeriodStat,
  RosterEntry,
  ShiftAttendanceSettings,
  TimeWindow,
} from "@/lib/types";

export interface CurrentPeriodOperatorStatus {
  label: string;
  occurredAt: string | null;
}

export interface CurrentPeriodOperatorRow {
  id: string;
  username: string;
  displayName: string;
  shiftLabel: string;
  scheduledLabel: string;
  correctedByAdmin: boolean;
  statuses: CurrentPeriodOperatorStatus[];
}

interface PeriodDefinition {
  code: CurrentPeriodCode;
  label: string;
  description: string;
  getWindow: (settings: AppSettings) => TimeWindow | null;
  getEntries: (entries: RosterEntry[]) => RosterEntry[];
  stages: PeriodStageDefinition[];
}

interface PeriodStageDefinition {
  label: string;
  getPoint: (record: AttendanceRecord | null) => AttendancePoint | null;
}

function getScheduledEntries(entries: RosterEntry[]): RosterEntry[] {
  return entries.filter((entry) => entry.isScheduled);
}

function getDayEntries(entries: RosterEntry[]): RosterEntry[] {
  return getScheduledEntries(entries).filter((entry) => entry.shiftType === "day");
}

function getLateEntries(entries: RosterEntry[]): RosterEntry[] {
  return getScheduledEntries(entries).filter((entry) => entry.shiftType === "late");
}

function getDayLunchEntries(entries: RosterEntry[]): RosterEntry[] {
  return getDayEntries(entries).filter((entry) => entry.allowLunchOut);
}

function getLateLunchEntries(entries: RosterEntry[]): RosterEntry[] {
  return getLateEntries(entries).filter((entry) => entry.allowLunchOut);
}

function getWeekendEntries(entries: RosterEntry[]): RosterEntry[] {
  return getScheduledEntries(entries).filter((entry) => entry.shiftType === "weekend");
}

function getWeekendLunchEntries(entries: RosterEntry[]): RosterEntry[] {
  return getWeekendEntries(entries).filter((entry) => entry.allowLunchOut);
}

function getShiftSettings(settings: AppSettings, shiftType: RosterEntry["shiftType"]): ShiftAttendanceSettings | null {
  const shift =
    shiftType === "late"
      ? settings.lateShift
      : shiftType === "weekend"
        ? (settings.weekendShift ?? settings.dayShift)
        : settings.dayShift;

  if (!shift || typeof shift !== "object") {
    return null;
  }

  return shift;
}

function getShiftWindow(
  settings: AppSettings,
  shiftType: RosterEntry["shiftType"],
  selector: (shift: ShiftAttendanceSettings) => TimeWindow | null,
): TimeWindow | null {
  const shift = getShiftSettings(settings, shiftType);

  if (!shift) {
    return null;
  }

  return selector(shift);
}

const PERIOD_DEFINITIONS: PeriodDefinition[] = [
  {
    code: "am",
    label: "주간조 출근 / 오전 TBM",
    description: "주간조 출근과 오전 TBM을 확인하는 시간입니다.",
    getWindow: (settings) => getShiftWindow(settings, "day", (shift) => shift.checkInWindow),
    getEntries: getDayEntries,
    stages: [
      {
        label: "주간조 출근",
        getPoint: (record) => record?.checkIn ?? null,
      },
      {
        label: "오전 TBM",
        getPoint: (record) => record?.tbmMorning ?? record?.tbm ?? null,
      },
    ],
  },
  {
    code: "late_check_in",
    label: "늦조 출근",
    description: "늦조 출근을 확인하는 시간입니다.",
    getWindow: (settings) => getShiftWindow(settings, "late", (shift) => shift.checkInWindow),
    getEntries: getLateEntries,
    stages: [
      {
        label: "늦조 출근",
        getPoint: (record) => record?.checkIn ?? null,
      },
    ],
  },
  {
    code: "lunch_day",
    label: "주간조 점심",
    description: "주간조 점심 등록, 출문, 입문을 확인하는 시간입니다.",
    getWindow: (settings) => getShiftWindow(settings, "day", (shift) => shift.lunchOutWindow),
    getEntries: getDayLunchEntries,
    stages: [
      {
        label: "점심 등록",
        getPoint: (record) => record?.lunchRegister ?? null,
      },
      {
        label: "점심 출문",
        getPoint: (record) => record?.lunchOut ?? null,
      },
      {
        label: "점심 입문",
        getPoint: (record) => record?.lunchIn ?? null,
      },
    ],
  },
  {
    code: "tbm_afternoon",
    label: "오후 TBM",
    description: "주간조 오후 TBM을 확인하는 시간입니다.",
    getWindow: (settings) => getShiftWindow(settings, "day", (shift) => shift.tbmAfternoonWindow),
    getEntries: getDayEntries,
    stages: [
      {
        label: "오후 TBM",
        getPoint: (record) => record?.tbmAfternoon ?? null,
      },
    ],
  },
  {
    code: "lunch_late",
    label: "늦조 점심",
    description: "늦조 점심 등록, 출문, 입문을 확인하는 시간입니다.",
    getWindow: (settings) => getShiftWindow(settings, "late", (shift) => shift.lunchOutWindow),
    getEntries: getLateLunchEntries,
    stages: [
      {
        label: "점심 등록",
        getPoint: (record) => record?.lunchRegister ?? null,
      },
      {
        label: "점심 출문",
        getPoint: (record) => record?.lunchOut ?? null,
      },
      {
        label: "점심 입문",
        getPoint: (record) => record?.lunchIn ?? null,
      },
    ],
  },
  {
    code: "lunch_weekend",
    label: "주말 점심",
    description: "주말 점심 등록, 출문, 입문을 확인하는 시간입니다.",
    getWindow: (settings) => getShiftWindow(settings, "weekend", (shift) => shift.lunchOutWindow),
    getEntries: getWeekendLunchEntries,
    stages: [
      {
        label: "점심 등록",
        getPoint: (record) => record?.lunchRegister ?? null,
      },
      {
        label: "점심 출문",
        getPoint: (record) => record?.lunchOut ?? null,
      },
      {
        label: "점심 입문",
        getPoint: (record) => record?.lunchIn ?? null,
      },
    ],
  },
  {
    code: "tbm_checkout",
    label: "퇴근 TBM",
    description: "주간조 퇴근 전 TBM을 확인하는 시간입니다.",
    getWindow: (settings) => getShiftWindow(settings, "day", (shift) => shift.tbmCheckoutWindow),
    getEntries: getDayEntries,
    stages: [
      {
        label: "퇴근 TBM",
        getPoint: (record) => record?.tbmCheckout ?? null,
      },
    ],
  },
  {
    code: "day_checkout",
    label: "주간조 퇴근 현황",
    description: "주간조 퇴근 현황을 확인하는 시간입니다.",
    getWindow: (settings) => getShiftWindow(settings, "day", (shift) => shift.checkOutWindow),
    getEntries: getDayEntries,
    stages: [
      {
        label: "주간조 퇴근",
        getPoint: (record) => record?.checkOut ?? null,
      },
    ],
  },
  {
    code: "late_checkout",
    label: "늦조 퇴근 현황",
    description: "늦조 퇴근 현황을 확인하는 시간입니다.",
    getWindow: (settings) => getShiftWindow(settings, "late", (shift) => shift.checkOutWindow),
    getEntries: getLateEntries,
    stages: [
      {
        label: "늦조 퇴근",
        getPoint: (record) => record?.checkOut ?? null,
      },
    ],
  },
];

const NONE_PERIOD: CurrentPeriodInfo = {
  code: "none",
  label: "수고하셨습니다",
  description: "현재는 주요 출결 확인 시간이 아닙니다.",
};

function getTargetEntries(entries: RosterEntry[], periodCode: CurrentPeriodCode): RosterEntry[] {
  return PERIOD_DEFINITIONS.find((definition) => definition.code === periodCode)?.getEntries(entries) ?? [];
}

export function getCurrentPeriodStatuses(
  row: AttendanceRecord | null,
  periodCode: CurrentPeriodCode,
): CurrentPeriodOperatorStatus[] {
  const definition = PERIOD_DEFINITIONS.find((item) => item.code === periodCode);

  if (!definition) {
    return [];
  }

  return definition.stages.map((stage) => ({
    label: stage.label,
    occurredAt: row ? (stage.getPoint(row)?.occurredAt ?? null) : null,
  }));
}

export function buildCurrentPeriodOperatorRows(input: {
  periodCode: CurrentPeriodCode;
  scheduledUsers: RosterEntry[];
  rows: AttendanceRecord[];
}): CurrentPeriodOperatorRow[] {
  const targetEntries = getTargetEntries(input.scheduledUsers, input.periodCode);
  const recordMap = new Map(input.rows.map((row) => [row.username, row]));

  return targetEntries
    .map((entry) => {
      const record = recordMap.get(entry.username) ?? null;

      return {
        id: record?.id ?? entry.username,
        username: entry.username,
        displayName: entry.displayName,
        shiftLabel: entry.shiftType === "late" ? "늦조" : "주간조",
        scheduledLabel: "대상",
        correctedByAdmin: record?.correctedByAdmin ?? false,
        statuses: getCurrentPeriodStatuses(record, input.periodCode),
      } satisfies CurrentPeriodOperatorRow;
    })
    .sort((left, right) => {
      const leftPending = left.statuses.filter((status) => !status.occurredAt).length;
      const rightPending = right.statuses.filter((status) => !status.occurredAt).length;

      if (leftPending !== rightPending) {
        return rightPending - leftPending;
      }

      return left.displayName.localeCompare(right.displayName, "ko");
    });
}

function countCompleted(
  entries: RosterEntry[],
  rowMap: Map<string, AttendanceRecord>,
  selector: (record: AttendanceRecord | null) => AttendancePoint | null,
): number {
  return entries.reduce((count, entry) => {
    const record = rowMap.get(entry.username) ?? null;
    return selector(record) ? count + 1 : count;
  }, 0);
}

function buildStat(
  label: string,
  entries: RosterEntry[],
  rowMap: Map<string, AttendanceRecord>,
  selector: (record: AttendanceRecord | null) => AttendancePoint | null,
): CurrentPeriodStat {
  const targetCount = entries.length;
  const completedCount = targetCount === 0 ? 0 : countCompleted(entries, rowMap, selector);

  return {
    label,
    targetCount,
    completedCount,
    pendingCount: Math.max(targetCount - completedCount, 0),
  };
}

export function getCurrentPeriod(
  settings: AppSettings,
  now: Date = new Date(),
  scheduledUsers?: RosterEntry[],
): CurrentPeriodInfo {
  const activeDefinitions = PERIOD_DEFINITIONS.filter((definition) => {
    const window = definition.getWindow(settings);
    return window ? isWithinWindow(window.start, window.end, now) : false;
  });

  if (activeDefinitions.length === 0) {
    return NONE_PERIOD;
  }

  const definition = scheduledUsers
    ? activeDefinitions.find((item) => item.getEntries(scheduledUsers).length > 0) ?? activeDefinitions[0]
    : activeDefinitions[0];

  return {
    code: definition.code,
    label: definition.label,
    description: definition.description,
  };
}

export function buildCurrentPeriodStats(input: {
  period: CurrentPeriodInfo;
  scheduledUsers: RosterEntry[];
  rows: AttendanceRecord[];
}): CurrentPeriodStat[] {
  const rowMap = new Map(input.rows.map((row) => [row.username, row]));
  const definition = PERIOD_DEFINITIONS.find((item) => item.code === input.period.code);

  if (!definition) {
    return [];
  }

  const targetEntries = definition.getEntries(input.scheduledUsers);

  return definition.stages.map((stage) =>
    buildStat(stage.label, targetEntries, rowMap, (record) => stage.getPoint(record)),
  );
}
