import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth-config";
import { getSessionUserByUsername, getUserDepartmentCode } from "@/lib/app-data";
import { isDepartmentLocked } from "@/lib/department-lock";
import { encodeSessionToken, verifySessionToken } from "@/lib/session-token";
import { canViewAdmin } from "@/lib/permissions";
import type { SessionUser } from "@/lib/types";

export async function createSession(user: SessionUser) {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, await encodeSessionToken({ ...user, issuedAt: new Date().toISOString() }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const rawToken = store.get(SESSION_COOKIE_NAME)?.value;

  if (!rawToken) {
    return null;
  }

  const payload = await verifySessionToken(rawToken);

  if (!payload) {
    return null;
  }

  // Re-check the user against the DB on every request so a deactivated or deleted
  // user is blocked immediately instead of waiting for token expiry.
  const freshUser = await getSessionUserByUsername(payload.username);

  if (!freshUser) {
    return null;
  }

  // Locked departments cannot use the app: treat any session for a locked
  // department as absent so protected pages and APIs reject it immediately,
  // even for sessions issued before the lock. See lib/department-lock.ts.
  if (isDepartmentLocked(await getUserDepartmentCode(freshUser.username))) {
    return null;
  }

  return {
    username: freshUser.username,
    displayName: freshUser.displayName,
    role: freshUser.role,
    departmentId: freshUser.departmentId ?? null,
    departmentCode: payload.departmentCode ?? null,
    departmentName: payload.departmentName ?? null,
  };
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireSession();

  if (session.role !== "master" && session.role !== "admin" && session.role !== "sub_admin") {
    redirect("/");
  }

  return session;
}

export async function requireAdminOrSubAdmin(): Promise<SessionUser> {
  const session = await requireSession();

  if (session.role !== "master" && session.role !== "admin" && session.role !== "sub_admin") {
    redirect("/");
  }

  return session;
}

// 관리자 화면 열람 게이트. viewer(열람 전용) 포함. 쓰기 API는 이 게이트를 쓰지 않고
// isAdminRole/isSystemAdminRole/master 게이트로 계속 막으므로 viewer는 열람만 가능하다.
export async function requireAdminView(): Promise<SessionUser> {
  const session = await requireSession();

  if (!canViewAdmin(session.role)) {
    redirect("/");
  }

  return session;
}
