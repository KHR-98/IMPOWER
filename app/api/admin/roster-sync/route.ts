import { NextResponse } from "next/server";

import { syncRoster } from "@/lib/app-data";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";

export async function POST() {
  const session = await getSession();

  if (!session || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const result = await syncRoster();

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json(result);
}
