import { NextResponse } from "next/server";

import { getDashboardView, getDepartments } from "@/lib/app-data";
import { getSession } from "@/lib/auth";
import { canSelectAnyDepartment } from "@/lib/permissions";
import { buildRosterText } from "@/lib/roster-copy-text";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !canSelectAnyDepartment(session.role)) {
    return NextResponse.json({ error: "명단 복사 권한이 없습니다." }, { status: 403 });
  }

  const requestedDepartmentId = new URL(request.url).searchParams.get("departmentId");

  const activeDepartments = (await getDepartments()).filter((department) => department.isActive);
  // 요청 부서(관리자 화면에서 선택한 탭)를 우선하고, 없으면 첫 활성 부서로 폴백한다(오늘현황 기본값과 동일).
  const targetDepartment =
    activeDepartments.find((department) => department.id === requestedDepartmentId) ?? activeDepartments[0] ?? null;

  if (!targetDepartment) {
    return NextResponse.json({ error: "조회할 부서가 없습니다." }, { status: 404 });
  }

  const dashboard = await getDashboardView(targetDepartment.id);
  const text = buildRosterText(dashboard.scheduledUsers, targetDepartment.name, dashboard.dateKey);

  return new NextResponse(text, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
