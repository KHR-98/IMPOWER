import { NextRequest, NextResponse } from "next/server";

import { syncRoster } from "@/lib/app-data";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncRoster();

    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    // 매일 자동 동기화가 조용히 실패하면 오늘현황이 통째로 비므로 로그를 남긴다.
    console.error("[roster-sync:cron] 동기화에 실패했습니다.", error);
    const detail = error instanceof Error ? error.message : String(error);

    return NextResponse.json({ error: `근무표 동기화에 실패했습니다: ${detail}` }, { status: 500 });
  }
}
