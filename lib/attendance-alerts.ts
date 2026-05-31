import "server-only";

import { getDashboardView, getDepartments } from "@/lib/app-data";
import { sendAlert } from "@/lib/alerts";
import { getKoreaDateKey } from "@/lib/time";
import type { AttendanceRecord, Department, RosterEntry } from "@/lib/types";
import type { TelegramAlertSendResult } from "@/lib/telegram";

export type AttendanceAlertKind = "check-in" | "check-out";

export interface DepartmentAttendanceAlertSummary {
  departmentId: string;
  departmentName: string;
  totalCount: number;
  completedCount: number;
  pendingCount: number;
  pendingNames: string[];
}

export interface AttendanceAlertMessageInput {
  kind: AttendanceAlertKind;
  workDate: string;
  scheduledTime: string;
  departments: DepartmentAttendanceAlertSummary[];
}

export interface AttendanceStatusAlertReport extends AttendanceAlertMessageInput {
  message: string;
}

export interface AttendanceStatusAlertResult {
  ok: boolean;
  report: AttendanceStatusAlertReport;
  telegram: TelegramAlertSendResult;
}

interface AlertDefinition {
  title: string;
  scheduledTime: string;
  completedLabel: string;
  pendingLabel: string;
  pendingListLabel: string;
  getPoint: (record: AttendanceRecord | null) => AttendanceRecord["checkIn"] | AttendanceRecord["checkOut"] | null;
}

const ALERT_DEFINITIONS: Record<AttendanceAlertKind, AlertDefinition> = {
  "check-in": {
    title: "출근 출결 현황",
    scheduledTime: "07:40",
    completedLabel: "출근 완료",
    pendingLabel: "미출근",
    pendingListLabel: "미출근자",
    getPoint: (record) => record?.checkIn ?? null,
  },
  "check-out": {
    title: "퇴근 출결 현황",
    scheduledTime: "17:10",
    completedLabel: "퇴근 완료",
    pendingLabel: "미퇴근",
    pendingListLabel: "미퇴근자",
    getPoint: (record) => record?.checkOut ?? null,
  },
};

function sortNames(names: string[]): string[] {
  return [...names].sort((left, right) => left.localeCompare(right, "ko"));
}

function buildSummary(
  department: Department,
  scheduledUsers: RosterEntry[],
  records: AttendanceRecord[],
  kind: AttendanceAlertKind,
): DepartmentAttendanceAlertSummary {
  const definition = ALERT_DEFINITIONS[kind];
  const recordMap = new Map(records.map((record) => [record.username, record]));
  const targets = scheduledUsers.filter((entry) => entry.isScheduled);
  const completedCount = targets.reduce((count, entry) => {
    const record = recordMap.get(entry.username) ?? null;
    return definition.getPoint(record) ? count + 1 : count;
  }, 0);
  const pendingNames = sortNames(
    targets
      .filter((entry) => !definition.getPoint(recordMap.get(entry.username) ?? null))
      .map((entry) => entry.displayName),
  );

  return {
    departmentId: department.id,
    departmentName: department.name,
    totalCount: targets.length,
    completedCount,
    pendingCount: pendingNames.length,
    pendingNames,
  };
}

function buildDepartmentMessage(
  summary: DepartmentAttendanceAlertSummary,
  definition: AlertDefinition,
): string {
  const lines = [
    summary.departmentName,
    `전체 대상: ${summary.totalCount}명`,
    `${definition.completedLabel}: ${summary.completedCount}명`,
    `${definition.pendingLabel}: ${summary.pendingCount}명`,
  ];

  if (summary.pendingNames.length === 0) {
    lines.push(`${definition.pendingListLabel}: 없음`);
  } else {
    lines.push(`${definition.pendingListLabel}:`, ...summary.pendingNames.map((name) => `- ${name}`));
  }

  return lines.join("\n");
}

export function buildAttendanceAlertMessage(input: AttendanceAlertMessageInput): string {
  const definition = ALERT_DEFINITIONS[input.kind];
  const departmentMessages =
    input.departments.length > 0
      ? input.departments.map((department) => buildDepartmentMessage(department, definition))
      : ["표시할 부서가 없습니다."];

  return [
    `[${definition.title}] ${input.workDate} ${input.scheduledTime}`,
    ...departmentMessages,
  ].join("\n\n");
}

export async function buildAttendanceStatusAlertReport(
  kind: AttendanceAlertKind,
  now: Date = new Date(),
): Promise<AttendanceStatusAlertReport> {
  const departments = await getDepartments();
  const summaries = await Promise.all(
    departments.map(async (department) => {
      const view = await getDashboardView(department.id);
      return buildSummary(department, view.scheduledUsers, view.rows, kind);
    }),
  );
  const workDate = getKoreaDateKey(now);
  const scheduledTime = ALERT_DEFINITIONS[kind].scheduledTime;
  const message = buildAttendanceAlertMessage({
    kind,
    workDate,
    scheduledTime,
    departments: summaries,
  });

  return {
    kind,
    workDate,
    scheduledTime,
    departments: summaries,
    message,
  };
}

export async function sendAttendanceStatusAlert(kind: AttendanceAlertKind): Promise<AttendanceStatusAlertResult> {
  const report = await buildAttendanceStatusAlertReport(kind);
  const telegram = await sendAlert({ message: report.message });

  return {
    ok: telegram.ok,
    report,
    telegram,
  };
}
