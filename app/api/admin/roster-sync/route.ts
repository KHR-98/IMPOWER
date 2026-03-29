import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getRosterSyncPreview, syncRoster } from "@/lib/app-data";

async function requireAdminSession() {
  const session = await getSession();

  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  return null;
}

export async function GET() {
  const denied = await requireAdminSession();

  if (denied) {
    return denied;
  }

  const preview = await getRosterSyncPreview();

  if (!preview) {
    return NextResponse.json({ error: "근무표 미리보기를 불러올 수 없습니다." }, { status: 400 });
  }

  return NextResponse.json(preview);
}

export async function POST() {
  const denied = await requireAdminSession();

  if (denied) {
    return denied;
  }

  const result = await syncRoster();

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json(result);
}
