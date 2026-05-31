import {
  buildAttendanceAlertMessage,
  sendAttendanceStatusAlert,
  type AttendanceAlertKind,
  type DepartmentAttendanceAlertSummary,
} from "@/lib/attendance-alerts";

const kind: AttendanceAlertKind = "check-in";

const summaries: DepartmentAttendanceAlertSummary[] = [
  {
    departmentId: "memory-pcs",
    departmentName: "Memory PCS",
    totalCount: 3,
    completedCount: 2,
    pendingCount: 1,
    pendingNames: ["Kim"],
  },
  {
    departmentId: "memory",
    departmentName: "Memory",
    totalCount: 0,
    completedCount: 0,
    pendingCount: 0,
    pendingNames: [],
  },
];

const message: string = buildAttendanceAlertMessage({
  kind,
  workDate: "2026-05-31",
  scheduledTime: "07:40",
  departments: summaries,
});

async function verifyAttendanceAlertApi() {
  await sendAttendanceStatusAlert(kind);
}

void message;
void verifyAttendanceAlertApi;
