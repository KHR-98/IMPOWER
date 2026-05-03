import "server-only";

const KAKAO_AUTH_BASE = "https://kauth.kakao.com/oauth/authorize";
export const KAKAO_OAUTH_STATE_COOKIE = "kakao_oauth_state";
export const KAKAO_OAUTH_STATE_MAX_AGE_SECONDS = 600;

export function getKakaoRestApiKey(): string | null {
  return process.env.KAKAO_REST_API_KEY || process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY || null;
}

export function getKakaoRedirectBase(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export function getKakaoRedirectUri(request: Request): string {
  return `${getKakaoRedirectBase(request)}/api/auth/kakao/callback`;
}

export function buildKakaoAuthorizationUrl(request: Request, state: string): string | null {
  const restApiKey = getKakaoRestApiKey();

  if (!restApiKey) {
    return null;
  }

  const kakaoUrl = new URL(KAKAO_AUTH_BASE);
  kakaoUrl.searchParams.set("client_id", restApiKey);
  kakaoUrl.searchParams.set("redirect_uri", getKakaoRedirectUri(request));
  kakaoUrl.searchParams.set("response_type", "code");
  kakaoUrl.searchParams.set("state", state);
  return kakaoUrl.toString();
}
