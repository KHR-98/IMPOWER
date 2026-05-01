import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { findUserByKakaoId } from "@/lib/app-data";
import { createSession } from "@/lib/auth";
import { getKakaoRedirectUri, getKakaoRestApiKey } from "@/lib/kakao-oauth";
import { encodeKakaoPendingToken } from "@/lib/kakao-token";

const KAKAO_PENDING_COOKIE = "kakao_pending";

type KakaoTokenError = {
  error?: string;
  error_code?: string;
  error_description?: string;
};

async function getTokenErrorCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as KakaoTokenError;
    return body.error_code ?? body.error ?? null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    redirect("/login?error=kakao_cancelled");
  }

  const restApiKey = getKakaoRestApiKey();
  if (!restApiKey) {
    redirect("/login?error=kakao_config");
  }

  const tokenParams: Record<string, string> = {
    grant_type: "authorization_code",
    client_id: restApiKey,
    redirect_uri: getKakaoRedirectUri(request),
    code,
  };

  const clientSecret = process.env.KAKAO_CLIENT_SECRET;
  if (clientSecret) {
    tokenParams.client_secret = clientSecret;
  }

  const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(tokenParams),
  });

  if (!tokenRes.ok) {
    const tokenErrorCode = await getTokenErrorCode(tokenRes);
    if (tokenErrorCode === "KOE010" || tokenErrorCode === "invalid_client") {
      redirect("/login?error=kakao_credentials");
    }

    redirect("/login?error=kakao_token");
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string };
  const accessToken = tokenData.access_token;

  if (!accessToken) {
    redirect("/login?error=kakao_token");
  }

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

  const existingUser = await findUserByKakaoId(kakaoId);

  if (existingUser) {
    await createSession(existingUser);
    redirect(existingUser.role === "admin" ? "/admin" : "/dashboard");
  }

  const pendingToken = await encodeKakaoPendingToken({ kakaoId, kakaoNickname });
  const store = await cookies();
  store.set(KAKAO_PENDING_COOKIE, pendingToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  redirect("/login/kakao-register");
}
