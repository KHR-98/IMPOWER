import { NextResponse } from "next/server";
import { z } from "zod";

import { performAttendanceAction } from "@/lib/app-data";
import { isAttendanceAction } from "@/lib/attendance-rules";
import { getSession } from "@/lib/auth";

const coordinateSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  accuracyM: z.number().nonnegative(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { action } = await context.params;

  if (!isAttendanceAction(action)) {
    return NextResponse.json({ error: "지원하지 않는 기록 유형입니다." }, { status: 404 });
  }

  const parsed = coordinateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "위치 정보 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const result = await performAttendanceAction({
    username: session.username,
    action,
    sessionUser: session,
    ...parsed.data,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ message: result.message, eventStates: result.eventStates });
}
