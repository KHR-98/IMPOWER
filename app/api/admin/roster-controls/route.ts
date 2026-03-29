import { NextResponse } from "next/server";
import { z } from "zod";

import { saveAdminRosterControls } from "@/lib/app-data";
import { getSession } from "@/lib/auth";

const workDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const schema = z.object({
  workDate: z.string().regex(workDatePattern, "날짜 형식을 확인하세요."),
  entries: z.array(
    z.object({
      username: z.string().trim().min(1, "사용자 ID가 필요합니다."),
      shiftType: z.enum(["day", "late"]),
      allowLunchOut: z.boolean(),
    }),
  ),
});

export async function PATCH(request: Request) {
  const session = await getSession();

  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." }, { status: 400 });
  }

  const result = await saveAdminRosterControls(parsed.data);

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json(result);
}
