import { NextResponse } from "next/server";

import { buildKakaoAuthorizationUrl } from "@/lib/kakao-oauth";

export function GET(request: Request) {
  const kakaoUrl = buildKakaoAuthorizationUrl(request);

  if (!kakaoUrl) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "kakao_config");
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(kakaoUrl);
}
