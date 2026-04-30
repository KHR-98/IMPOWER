import { NextResponse } from "next/server";
import { z } from "zod";

import { saveAdminRosterEntry } from "@/lib/app-data";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";

const workDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const schema = z.object({
  workDate: z.string().regex(workDatePattern, "날짜 형식을 확인하세요."),
  username: z.string().trim().min(1, "사용자 ID가 필요합니다."),
  displayName: z.string().trim().min(1, "표시 이름이 필요합니다."),
  isScheduled: z.boolean(),
  shiftType: z.enum(["day", "late"]),
  reasonCode: z
    .enum(["leave", "half_day_am", "half_day_pm", "half_day", "military", "holiday", "blocked", "not_synced", "not_scheduled", "not_listed", "sheet_missing"])
    .nullable(),
});

export async function PATCH(request: Request) {
  const session = await getSession();

  if (!session || !isAdminRole(session.role)) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." }, { status: 400 });
  }

  const result = await saveAdminRosterEntry(parsed.data);

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json(result);
}
