import { NextResponse } from "next/server";
import { z } from "zod";

import { saveAdminAttendanceCorrection } from "@/lib/app-data";
import { getSession } from "@/lib/auth";

const correctionSchema = z.object({
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "근무일 형식이 올바르지 않습니다."),
  username: z.string().trim().min(1, "사용자를 선택하세요."),
  expectedUpdatedAt: z.string().datetime({ offset: true }).nullable(),
  checkInAt: z.string().datetime({ offset: true }).nullable(),
  tbmAt: z.string().datetime({ offset: true }).nullable(),
  checkOutAt: z.string().datetime({ offset: true }).nullable(),
  reason: z.string().trim().min(2, "정정 사유를 입력하세요."),
});

export async function PATCH(request: Request) {
  const session = await getSession();

  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const rawBody = (await request.json()) as unknown;
  const parsed = correctionSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." }, { status: 400 });
  }

  const result = await saveAdminAttendanceCorrection(parsed.data, session.displayName);

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json(result);
}
