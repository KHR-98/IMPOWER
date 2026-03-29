import { NextResponse } from "next/server";

import { getDashboardView } from "@/lib/app-data";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();

  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  return NextResponse.json(await getDashboardView());
}
