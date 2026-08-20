import { NextResponse } from "next/server";

import { syncRoster } from "@/lib/app-data";
import { getSession } from "@/lib/auth";
import { isSystemAdminRole } from "@/lib/permissions";

export async function POST() {
  const session = await getSession();

  if (!session || !isSystemAdminRole(session.role)) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  try {
    const result = await syncRoster();

    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    // 예외를 그대로 흘리면 Next 가 JSON 아닌 500 본문을 반환해 클라이언트가
    // "알 수 없는 오류"만 보여준다. 원인을 문구로 내려 진단 가능하게 한다.
    console.error("[roster-sync] 동기화에 실패했습니다.", error);
    const detail = error instanceof Error ? error.message : String(error);

    return NextResponse.json({ error: `근무표 동기화에 실패했습니다: ${detail}` }, { status: 500 });
  }
}
