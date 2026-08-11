import { NextResponse } from "next/server";
import { z } from "zod";

import { createInitialInviteLinks, createInviteLink, deactivateInviteLink } from "@/lib/app-data";
import { getSession } from "@/lib/auth";
import { isSystemAdminRole } from "@/lib/permissions";

const createInviteLinkSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("initial"),
  }),
  z.object({
    mode: z.literal("standard"),
    departmentId: z.string().trim().min(1, "부서를 선택하세요.").nullable(),
    maxUses: z.number().int().min(1, "가입 가능 인원은 1명 이상이어야 합니다.").max(10, "신규 링크는 최대 10명까지 사용할 수 있습니다."),
  }),
]);

const deactivateInviteLinkSchema = z.object({
  id: z.string().trim().min(1, "초대링크 ID를 확인하세요."),
});

async function requireInviteLinkAdminSession() {
  const session = await getSession();

  if (!session || !isSystemAdminRole(session.role)) {
    return {
      session: null,
      response: NextResponse.json({ error: "초대링크 관리 권한이 필요합니다." }, { status: 403 }),
    };
  }

  return {
    session,
    response: null,
  };
}

export async function POST(request: Request) {
  const auth = await requireInviteLinkAdminSession();

  if (auth.response || !auth.session) {
    return auth.response;
  }

  const rawBody = (await request.json()) as unknown;
  const parsed = createInviteLinkSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." }, { status: 400 });
  }

  const result = parsed.data.mode === "initial"
    ? await createInitialInviteLinks(auth.session)
    : await createInviteLink({
        departmentId: parsed.data.departmentId,
        maxUses: parsed.data.maxUses,
      }, auth.session);

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json(result);
}

export async function DELETE(request: Request) {
  const auth = await requireInviteLinkAdminSession();

  if (auth.response || !auth.session) {
    return auth.response;
  }

  const rawBody = (await request.json()) as unknown;
  const parsed = deactivateInviteLinkSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." }, { status: 400 });
  }

  const result = await deactivateInviteLink(parsed.data.id, auth.session);

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json(result);
}
