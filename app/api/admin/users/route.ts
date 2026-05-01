import { NextResponse } from "next/server";
import { z } from "zod";

import { deleteAdminUser, saveAdminUser } from "@/lib/app-data";
import { getSession } from "@/lib/auth";
import { isSystemAdminRole } from "@/lib/permissions";

const adminUserSchema = z
  .object({
    mode: z.enum(["create", "update"]),
    username: z.string().trim().min(1, "로그인 ID를 입력하세요.").max(40, "로그인 ID가 너무 깁니다.").regex(/^\S+$/, "로그인 ID에는 공백을 넣을 수 없습니다."),
    displayName: z.string().trim().min(1, "표시 이름을 입력하세요.").max(40, "표시 이름이 너무 깁니다."),
    role: z.enum(["user", "admin", "sub_admin", "master"]),
    departmentId: z.string().uuid("부서를 선택하세요.").nullable(),
    isActive: z.boolean(),
    password: z.string().trim().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "create" && !value.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "새 사용자 비밀번호를 입력하세요.",
      });
    }

    if (value.password && value.password.length < 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "비밀번호는 4자 이상이어야 합니다.",
      });
    }
  });

const deleteUserSchema = z.object({
  username: z.string().trim().min(1, "삭제할 로그인 ID를 확인하세요."),
});

async function requireAdminSession() {
  const session = await getSession();

  if (!session || !isSystemAdminRole(session.role)) {
    return {
      session: null,
      response: NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 }),
    };
  }

  return {
    session,
    response: null,
  };
}

export async function PUT(request: Request) {
  const auth = await requireAdminSession();

  if (auth.response) {
    return auth.response;
  }

  const rawBody = (await request.json()) as unknown;
  const parsed = adminUserSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." }, { status: 400 });
  }

  const result = await saveAdminUser({
    ...parsed.data,
    departmentId: parsed.data.departmentId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json(result);
}

export async function DELETE(request: Request) {
  const auth = await requireAdminSession();

  if (auth.response || !auth.session) {
    return auth.response;
  }

  try {
    const rawBody = (await request.json()) as unknown;
    const parsed = deleteUserSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." }, { status: 400 });
    }

    const result = await deleteAdminUser(parsed.data.username, auth.session.username);

    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
