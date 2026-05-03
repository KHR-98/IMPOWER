import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getInviteRegistrationContext } from "@/lib/app-data";
import { INVITE_LINK_COOKIE, INVITE_LINK_COOKIE_MAX_AGE_SECONDS } from "@/lib/invite-link-cookie";
import { normalizeInviteToken } from "@/lib/invite-links";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: rawToken } = await params;
  const token = normalizeInviteToken(rawToken);
  const context = token ? await getInviteRegistrationContext(token) : null;
  const loginUrl = new URL("/login", request.url);

  if (!context) {
    loginUrl.searchParams.set("error", "invite_invalid");
    return NextResponse.redirect(loginUrl);
  }

  const store = await cookies();
  store.set(INVITE_LINK_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: INVITE_LINK_COOKIE_MAX_AGE_SECONDS,
  });

  return NextResponse.redirect(new URL("/api/auth/kakao/start", request.url));
}
