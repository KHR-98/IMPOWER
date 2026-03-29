import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionUserByUsername } from "@/lib/app-data";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth-config";
import { encodeSessionToken, verifySessionToken } from "@/lib/session-token";
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

  return getSessionUserByUsername(payload.username);
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

  if (session.role !== "admin") {
    redirect("/");
  }

  return session;
}
