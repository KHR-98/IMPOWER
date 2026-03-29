import { NextResponse } from "next/server";

import { getUserTodayView } from "@/lib/app-data";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  return NextResponse.json(await getUserTodayView(session.username));
}
