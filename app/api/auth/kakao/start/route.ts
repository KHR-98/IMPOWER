import { NextResponse } from "next/server";

import { KAKAO_OAUTH_STATE_COOKIE, KAKAO_OAUTH_STATE_MAX_AGE_SECONDS, buildKakaoAuthorizationUrl } from "@/lib/kakao-oauth";

export function GET(request: Request) {
  const state = crypto.randomUUID();
  const kakaoUrl = buildKakaoAuthorizationUrl(request, state);

  if (!kakaoUrl) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "kakao_config");
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.redirect(kakaoUrl);
  response.cookies.set(KAKAO_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: KAKAO_OAUTH_STATE_MAX_AGE_SECONDS,
  });
  return response;
}
