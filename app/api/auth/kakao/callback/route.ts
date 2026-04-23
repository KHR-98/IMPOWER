import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { findUserByKakaoId } from "@/lib/app-data";
import { createSession } from "@/lib/auth";
import { encodeKakaoPendingToken } from "@/lib/kakao-token";

const KAKAO_PENDING_COOKIE = "kakao_pending";

function getRedirectBase(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    redirect("/login?error=kakao_cancelled");
  }

  const restApiKey = process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY;
  if (!restApiKey) {
    return NextResponse.json({ error: "카카오 API 키가 설정되지 않았습니다." }, { status: 500 });
  }

  const redirectUri = `${getRedirectBase(request)}/api/auth/kakao/callback`;

  // 1. Exchange code for access token
  const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: restApiKey,
      redirect_uri: redirectUri,
      code,
    }),
  });

  if (!tokenRes.ok) {
    redirect("/login?error=kakao_token");
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string };
  const accessToken = tokenData.access_token;

  if (!accessToken) {
    redirect("/login?error=kakao_token");
  }

  // 2. Fetch Kakao user profile
  const profileRes = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!profileRes.ok) {
    redirect("/login?error=kakao_profile");
  }

  const profile = (await profileRes.json()) as {
    id?: number;
    properties?: { nickname?: string };
  };

  const kakaoId = String(profile.id ?? "");
  const kakaoNickname = profile.properties?.nickname ?? "";

  if (!kakaoId) {
    redirect("/login?error=kakao_profile");
  }

  // 3. Check if user already registered
  const existingUser = await findUserByKakaoId(kakaoId);

  if (existingUser) {
    await createSession(existingUser);
    redirect(existingUser.role === "admin" ? "/admin" : "/dashboard");
  }

  // 4. New user — issue pending token and redirect to name registration
  const pendingToken = await encodeKakaoPendingToken({ kakaoId, kakaoNickname });
  const store = await cookies();
  store.set(KAKAO_PENDING_COOKIE, pendingToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  redirect("/login/kakao-register");
}
