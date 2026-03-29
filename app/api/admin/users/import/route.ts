import { NextResponse } from "next/server";
import { z } from "zod";

import { getSheetUserImportPreview, importUsersFromSheet } from "@/lib/app-data";
import { getSession } from "@/lib/auth";

const importSchema = z.object({
  password: z.string().trim().min(4, "초기 비밀번호는 4자 이상이어야 합니다."),
  selectedNames: z.array(z.string().trim().min(1)).optional(),
});

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

  const preview = await getSheetUserImportPreview();

  if (!preview) {
    return NextResponse.json({ error: "Google Sheet 연동이 준비되지 않았습니다." }, { status: 400 });
  }

  return NextResponse.json(preview);
}

export async function POST(request: Request) {
  const denied = await requireAdminSession();

  if (denied) {
    return denied;
  }

  const rawBody = (await request.json()) as unknown;
  const parsed = importSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." }, { status: 400 });
  }

  const result = await importUsersFromSheet(parsed.data);

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json(result);
}

