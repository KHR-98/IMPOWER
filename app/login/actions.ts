"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { authenticateUser, changePassword, getDepartments } from "@/lib/app-data";
import { createSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";
import type { SessionUser, UserRole } from "@/lib/types";

export interface LoginState {
  error: string | null;
}

export interface PasswordChangeState {
  error: string | null;
  success: string | null;
}

const loginSchema = z.object({
  username: z.string().trim().min(1, "아이디를 입력하세요."),
  password: z.string().trim().min(1, "비밀번호를 입력하세요."),
});

const devLoginSchema = z.object({
  role: z.enum(["master", "admin", "sub_admin", "user"]),
});

const DEV_LOGIN_ACCOUNTS: Record<
  UserRole,
  { username: string; displayName: string; role: UserRole; departmentCode: string | null; departmentName: string | null }
> = {
  master: {
    username: "admin",
    displayName: "개발자 마스터",
    role: "master",
    departmentCode: null,
    departmentName: null,
  },
  admin: {
    username: "memory_pcs_admin",
    displayName: "메모리PCS 팀장",
    role: "admin",
    departmentCode: "memory_pcs",
    departmentName: "메모리PCS",
  },
  sub_admin: {
    username: "park",
    displayName: "메모리PCS 조장",
    role: "sub_admin",
    departmentCode: "memory_pcs",
    departmentName: "메모리PCS",
  },
  user: {
    username: "kim",
    displayName: "김민수",
    role: "user",
    departmentCode: "memory_pcs",
    departmentName: "메모리PCS",
  },
};

const changePasswordSchema = z
  .object({
    username: z.string().trim().min(1, "아이디를 입력하세요."),
    currentPassword: z.string().trim().min(1, "현재 비밀번호를 입력하세요."),
    nextPassword: z.string().trim().min(4, "새 비밀번호는 4자 이상이어야 합니다."),
    confirmPassword: z.string().trim().min(1, "새 비밀번호 확인을 입력하세요."),
  })
  .superRefine((value, ctx) => {
    if (value.nextPassword !== value.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "새 비밀번호 확인이 일치하지 않습니다.",
      });
    }

    if (value.currentPassword === value.nextPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nextPassword"],
        message: "새 비밀번호를 현재 비밀번호와 다르게 입력하세요.",
      });
    }
  });

export async function loginAction(_previousState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요.",
    };
  }

  const user = await authenticateUser(parsed.data.username, parsed.data.password);

  if (!user) {
    return {
      error: "아이디 또는 비밀번호가 올바르지 않습니다.",
    };
  }

  await createSession(user);
  redirect(isAdminRole(user.role) ? "/admin" : "/dashboard");
}

export async function devLoginAction(formData: FormData) {
  if (process.env.NODE_ENV === "production") {
    redirect("/login");
  }

  const parsed = devLoginSchema.safeParse({
    role: formData.get("role"),
  });

  if (!parsed.success) {
    redirect("/login");
  }

  const account = DEV_LOGIN_ACCOUNTS[parsed.data.role];
  const authenticatedUser = await authenticateUser(account.username, "demo1234").catch(() => null);
  const departments = await getDepartments().catch(() => []);
  const fallbackDepartment = account.departmentCode
    ? departments.find((department) => department.code === account.departmentCode)
    : null;

  const user: SessionUser = {
    username: account.username,
    displayName: authenticatedUser?.displayName ?? account.displayName,
    role: account.role,
    departmentId: authenticatedUser?.departmentId ?? fallbackDepartment?.id ?? null,
    departmentCode: authenticatedUser?.departmentCode ?? fallbackDepartment?.code ?? account.departmentCode,
    departmentName: authenticatedUser?.departmentName ?? fallbackDepartment?.name ?? account.departmentName,
  };

  await createSession(user);
  redirect(isAdminRole(user.role) ? "/admin" : "/dashboard");
}

export async function changePasswordAction(
  _previousState: PasswordChangeState,
  formData: FormData,
): Promise<PasswordChangeState> {
  const parsed = changePasswordSchema.safeParse({
    username: formData.get("username"),
    currentPassword: formData.get("currentPassword"),
    nextPassword: formData.get("nextPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요.",
      success: null,
    };
  }

  const result = await changePassword({
    username: parsed.data.username,
    currentPassword: parsed.data.currentPassword,
    nextPassword: parsed.data.nextPassword,
  });

  if (!result.ok) {
    return {
      error: result.message,
      success: null,
    };
  }

  return {
    error: null,
    success: result.message,
  };
}
