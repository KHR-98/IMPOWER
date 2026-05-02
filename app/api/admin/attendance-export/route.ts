import { NextResponse } from "next/server";

import { getShiftLabel } from "@/lib/attendance-events";
import { getAdminUserList, getDashboardView, getDepartments } from "@/lib/app-data";
import { getSession } from "@/lib/auth";
import { formatKoreaDateTime } from "@/lib/time";
import type { AttendancePoint } from "@/lib/types";

function csvCell(value: string | number | boolean | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function pointTime(point: AttendancePoint | null): string {
  return point ? formatKoreaDateTime(point.occurredAt) : "";
}

function safeFilePart(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_") || "attendance";
}

export async function GET(request: Request) {
  const session = await getSession();

  if (!session || session.role !== "master") {
    return NextResponse.json({ error: "마스터 계정만 출결 엑셀을 다운로드할 수 있습니다." }, { status: 403 });
  }

  const url = new URL(request.url);
  const departmentId = url.searchParams.get("departmentId");
  const departments = await getDepartments();
  const selectedDepartment = departmentId && departmentId !== "all"
    ? departments.find((department) => department.id === departmentId)
    : null;

  if (departmentId && departmentId !== "all" && !selectedDepartment) {
    return NextResponse.json({ error: "존재하지 않는 부서입니다." }, { status: 400 });
  }

  const scopedDepartmentId = selectedDepartment?.id;
  const [dashboard, users] = await Promise.all([
    getDashboardView(scopedDepartmentId),
    getAdminUserList(scopedDepartmentId),
  ]);

  const departmentsById = new Map(departments.map((department) => [department.id, department]));
  const usersByUsername = new Map(users.map((user) => [user.username, user]));
  const rosterByUsername = new Map(dashboard.scheduledUsers.map((entry) => [entry.username, entry]));

  const header = [
    "날짜",
    "부서",
    "이름",
    "계정",
    "근무유형",
    "근무대상",
    "출근",
    "오전 TBM",
    "점심 등록",
    "점심 출문",
    "점심 입문",
    "오후 TBM",
    "퇴근 TBM",
    "퇴근",
    "정정 여부",
    "정정 사유",
    "최종 수정",
  ];

  const body = dashboard.rows.map((record) => {
    const user = usersByUsername.get(record.username);
    const department = user?.departmentId ? departmentsById.get(user.departmentId) : null;
    const roster = rosterByUsername.get(record.username);

    return [
      record.workDate,
      department?.name ?? user?.departmentName ?? "",
      record.displayName,
      record.username,
      getShiftLabel(roster?.shiftType ?? "day"),
      roster?.isScheduled ? "대상" : "비대상",
      pointTime(record.checkIn),
      pointTime(record.tbmMorning ?? record.tbm),
      pointTime(record.lunchRegister),
      pointTime(record.lunchOut),
      pointTime(record.lunchIn),
      pointTime(record.tbmAfternoon),
      pointTime(record.tbmCheckout),
      pointTime(record.checkOut),
      record.correctedByAdmin ? "정정" : "",
      record.correctionNote ?? "",
      formatKoreaDateTime(record.updatedAt),
    ];
  });

  const csv = `\uFEFF${[header, ...body].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  const scopeName = selectedDepartment?.name ?? "전체";
  const filename = `attendance-${dashboard.dateKey}-${safeFilePart(scopeName)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="attendance.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
