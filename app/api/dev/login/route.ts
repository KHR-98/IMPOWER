import { type NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/auth-config";
import { encodeSessionToken } from "@/lib/session-token";
import type { SessionUser } from "@/lib/types";

const DEV_USERS: Record<string, SessionUser> = {
  admin: {
    username: "admin",
    displayName: "현장관리자",
    role: "admin",
    departmentId: null,
    departmentCode: null,
    departmentName: null,
  },
  sub_admin: {
    username: "sub_admin",
    displayName: "부관리자",
    role: "sub_admin",
    departmentId: null,
    departmentCode: null,
    departmentName: null,
  },
  user: {
    username: "kim",
    displayName: "김철수",
    role: "user",
    departmentId: null,
    departmentCode: null,
    departmentName: null,
  },
};

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not Found", { status: 404 });
  }

  if (!process.env.SESSION_SECRET) {
    process.env.SESSION_SECRET = "dev-session-secret-change-me";
  }

  try {
    const role = request.nextUrl.searchParams.get("role") ?? "user";
    const sessionUser = DEV_USERS[role] ?? DEV_USERS.user;

    const token = await encodeSessionToken({ ...sessionUser, issuedAt: new Date().toISOString() });
    const destination = sessionUser.role === "admin" || sessionUser.role === "sub_admin" ? "/admin" : "/dashboard";
    const response = new NextResponse(null, {
      status: 307,
      headers: { Location: destination },
    });

    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });

    return response;
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : String(err);
    return new Response(message, { status: 500, headers: { "content-type": "text/plain" } });
  }
}
