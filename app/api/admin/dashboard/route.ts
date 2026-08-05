import { NextResponse } from "next/server";

import { getDashboardView } from "@/lib/app-data";
import { getSession } from "@/lib/auth";
import { canSelectAnyDepartment, canViewAdmin } from "@/lib/permissions";

export async function GET(request: Request) {
  const session = await getSession();

  if (!session || !canViewAdmin(session.role)) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const requestedDepartmentId = new URL(request.url).searchParams.get("departmentId");
  const departmentId = canSelectAnyDepartment(session.role) ? requestedDepartmentId ?? null : session.departmentId ?? null;

  return NextResponse.json(await getDashboardView(departmentId));
}
