import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

import { getMonthlyAttendanceExportData } from "@/lib/app-data";
import { getSession } from "@/lib/auth";
import { loadHolidayMap } from "@/lib/korean-holidays";
import { parseRosterReasonCodeFromSourceKey } from "@/lib/roster-reasons";
import { getSupabaseAdminClient } from "@/lib/supabase";
import { formatKoreaDateTime, getKoreaDateKey } from "@/lib/time";
import type { AttendancePoint, AttendanceRecord } from "@/lib/types";

function getDefaultExportMonth(): string {
  const today = getKoreaDateKey(); // YYYY-MM-DD (KST)
  const year = parseInt(today.slice(0, 4), 10);
  const month = parseInt(today.slice(5, 7), 10);
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, "0")}`;
}

function timeCell(point: AttendancePoint | null, fallback = "x"): string {
  return point ? formatKoreaDateTime(point.occurredAt) : fallback;
}

function absenceLabel(reasonCode: string | null | undefined): string | null {
  switch (reasonCode) {
    case "leave": return "연차";
    case "military": return "예비군";
    case "education": return "교육";
    case "family_event": return "경조사";
    case "vacation": return "휴가";
    default: return null;
  }
}

interface ExportRow {
  date: string;
  dept: string;
  name: string;
  checkIn: string;
  checkOut: string;
}

function buildRows(
  users: Array<{ username: string; display_name: string; department_id: string | null }>,
  records: AttendanceRecord[],
  rosters: Array<Record<string, unknown>>,
  departmentsById: Map<string, string>,
  holidayMap: Map<string, string>,
): ExportRow[] {
  const recordMap = new Map<string, AttendanceRecord>();
  for (const r of records) {
    recordMap.set(`${r.workDate}|${r.username}`, r);
  }

  const rosterMap = new Map<string, Record<string, unknown>>();
  for (const r of rosters) {
    rosterMap.set(`${r.work_date}|${r.username}`, r);
  }

  const userMap = new Map(users.map((u) => [u.username, u]));

  const keys = new Set<string>();
  for (const r of records) keys.add(`${r.workDate}|${r.username}`);
  for (const r of rosters) keys.add(`${r.work_date}|${r.username}`);

  const rows: ExportRow[] = [];

  for (const key of keys) {
    const [date, username] = key.split("|");
    const user = userMap.get(username);
    if (!user) continue;

    const dept = user.department_id ? (departmentsById.get(user.department_id) ?? "") : "";
    const record = recordMap.get(key) ?? null;
    const rosterRaw = rosterMap.get(key) ?? null;
    const reasonCode = rosterRaw
      ? parseRosterReasonCodeFromSourceKey(rosterRaw.source_row_key ? String(rosterRaw.source_row_key) : null)
      : null;
    const isScheduled = rosterRaw ? Boolean(rosterRaw.is_scheduled) : null;

    let checkIn: string;
    let checkOut: string;

    if (record) {
      if (reasonCode === "half_day_am") {
        checkIn = "(반차)";
        checkOut = record.checkOut ? "17:00" : "x";
      } else if (reasonCode === "half_day_pm") {
        checkIn = timeCell(record.checkIn);
        checkOut = "(반차)";
      } else {
        checkIn = timeCell(record.checkIn);
        checkOut = record.checkOut ? "17:00" : "x";
      }
    } else if (isScheduled === false) {
      const label = absenceLabel(reasonCode) ?? holidayMap.get(date) ?? null;
      if (label) {
        checkIn = label;
        checkOut = label;
      } else {
        checkIn = "";
        checkOut = "";
      }
    } else if (rosterRaw) {
      const holidayLabel = holidayMap.get(date) ?? null;
      if (holidayLabel) {
        checkIn = holidayLabel;
        checkOut = holidayLabel;
      } else {
        checkIn = "x";
        checkOut = "x";
      }
    } else {
      continue;
    }

    rows.push({ date, dept, name: user.display_name, checkIn, checkOut });
  }

  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.dept !== b.dept) return a.dept.localeCompare(b.dept, "ko");
    return a.name.localeCompare(b.name, "ko");
  });

  return rows;
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}(${WEEKDAY_KO[dow]})`;
}

function addSheet(wb: ExcelJS.Workbook, sheetName: string, rows: ExportRow[], holidayMap: Map<string, string>) {
  const ws = wb.addWorksheet(sheetName);

  // 날짜 목록 (정렬)
  const dates = [...new Set(rows.map((r) => r.date))].sort();

  // 인원 목록 (이름 기준 정렬, 중복 제거)
  const persons = [...new Map(rows.map((r) => [r.name, r.name])).keys()]
    .sort((a, b) => a.localeCompare(b, "ko"));

  // (날짜|이름) → 출퇴근 조회 맵
  const lookup = new Map(rows.map((r) => [`${r.date}|${r.name}`, r]));

  // 전원 공휴일인 날짜 계산 (한 명이라도 실제 출근 기록 있으면 제외)
  const mergedHolidayDates = new Map<string, string>();
  for (const date of dates) {
    const holidayName = holidayMap.get(date);
    if (!holidayName) continue;
    const entries = persons.map((name) => lookup.get(`${date}|${name}`)).filter(Boolean) as ExportRow[];
    if (entries.length > 0 && entries.every((e) => e.checkIn === holidayName && e.checkOut === holidayName)) {
      mergedHolidayDates.set(date, holidayName);
    }
  }

  // 열 너비 설정: 1열 이름(10), 이후 날짜마다 출근(7)+퇴근(7)
  ws.getColumn(1).width = 10;
  for (let i = 0; i < dates.length; i++) {
    ws.getColumn(2 + i * 2).width = 7;
    ws.getColumn(3 + i * 2).width = 7;
  }

  // 헤더 1행: 이름 | [날짜 병합 2열] | [날짜 병합 2열] | ...
  const h1 = ws.getRow(1);
  h1.getCell(1).value = "이름";
  h1.getCell(1).font = { bold: true };
  h1.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
  ws.mergeCells(1, 1, 2, 1); // 이름 셀을 2행 병합

  for (let i = 0; i < dates.length; i++) {
    const col = 2 + i * 2;
    const cell = h1.getCell(col);
    cell.value = formatDateLabel(dates[i]);
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center" };
    ws.mergeCells(1, col, 1, col + 1);
  }
  h1.commit();

  // 헤더 2행: (이름 병합 위) | 출근 | 퇴근 | 출근 | 퇴근 | ...
  const h2 = ws.getRow(2);
  for (let i = 0; i < dates.length; i++) {
    const col = 2 + i * 2;
    h2.getCell(col).value = "출근";
    h2.getCell(col).font = { bold: true };
    h2.getCell(col).alignment = { horizontal: "center" };
    h2.getCell(col + 1).value = "퇴근";
    h2.getCell(col + 1).font = { bold: true };
    h2.getCell(col + 1).alignment = { horizontal: "center" };
  }
  h2.commit();

  // 이름 열 + 2행 고정
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 2 }];

  const orangeFill: ExcelJS.Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFF8C00" },
  };
  const isLeaveCell = (v: string) => v.includes("연차") || v.includes("반차");

  const firstDataRow = 3;

  // 데이터 행: 인원 × 날짜 (공휴일 병합 대상 날짜는 셀 비워둠)
  for (const name of persons) {
    const dataRow = ws.addRow([]);
    dataRow.getCell(1).value = name;
    for (let i = 0; i < dates.length; i++) {
      if (mergedHolidayDates.has(dates[i])) continue;
      const entry = lookup.get(`${dates[i]}|${name}`);
      const col = 2 + i * 2;
      const ciVal = entry?.checkIn ?? "";
      const coVal = entry?.checkOut ?? "";
      const ciCell = dataRow.getCell(col);
      const coCell = dataRow.getCell(col + 1);
      ciCell.value = ciVal;
      coCell.value = coVal;
      if (isLeaveCell(ciVal)) ciCell.fill = orangeFill;
      if (isLeaveCell(coVal)) coCell.fill = orangeFill;
    }
    dataRow.commit();
  }

  // 공휴일 날짜: 전체 인원 행 × 출근+퇴근 2열 병합 후 공휴일명 중앙 표시
  if (persons.length > 0) {
    const lastDataRow = firstDataRow + persons.length - 1;
    for (let i = 0; i < dates.length; i++) {
      const holidayName = mergedHolidayDates.get(dates[i]);
      if (!holidayName) continue;
      const col = 2 + i * 2;
      ws.mergeCells(firstDataRow, col, lastDataRow, col + 1);
      const cell = ws.getCell(firstDataRow, col);
      cell.value = holidayName;
      cell.alignment = { vertical: "middle", horizontal: "center" };
    }
  }
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "master") {
    return NextResponse.json({ error: "마스터 계정만 출결 엑셀을 다운로드할 수 있습니다." }, { status: 403 });
  }

  const url = new URL(request.url);
  const rawMonth = url.searchParams.get("month");
  const month = rawMonth && /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : getDefaultExportMonth();
  const departmentId = url.searchParams.get("departmentId") || null;

  const [year, mon] = month.split("-").map(Number);
  const startDate = `${month}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const lastDayStr = `${month}-${String(lastDay).padStart(2, "0")}`;

  // 다운로드 시점 기준 전날(KST)까지만 출력
  const todayKst = getKoreaDateKey();
  const [ty, tm, td] = todayKst.split("-").map(Number);
  const yDate = new Date(ty, tm - 1, td - 1);
  const yesterdayStr = `${yDate.getFullYear()}-${String(yDate.getMonth() + 1).padStart(2, "0")}-${String(yDate.getDate()).padStart(2, "0")}`;
  const endDate = yesterdayStr < lastDayStr ? yesterdayStr : lastDayStr;

  const { users, records, rosters, departments } = await getMonthlyAttendanceExportData(startDate, endDate, departmentId);

  const departmentsById = new Map(departments.map((d: Record<string, unknown>) => [String(d.id), String(d.name)]));

  const holidayMap = await loadHolidayMap(getSupabaseAdminClient(), year);

  const allRows = buildRows(
    users as Array<{ username: string; display_name: string; department_id: string | null }>,
    records,
    rosters,
    departmentsById,
    holidayMap,
  );

  const deptNames = [...new Set(allRows.map((r) => r.dept).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));

  const wb = new ExcelJS.Workbook();
  for (const deptName of deptNames) {
    addSheet(wb, deptName, allRows.filter((r) => r.dept === deptName), holidayMap);
  }

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `attendance-${month}.xlsx`;

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}
