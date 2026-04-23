"use client";

const KAKAO_AUTH_BASE = "https://kauth.kakao.com/oauth/authorize";

export function KakaoLoginButton() {
  const restApiKey = process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY;

  if (!restApiKey) return null;

  const redirectUri = `${window.location.origin}/api/auth/kakao/callback`;
  const kakaoUrl = `${KAKAO_AUTH_BASE}?client_id=${restApiKey}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;

  return (
    <a href={kakaoUrl} className="button kakao-login-button">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M9 1C4.58 1 1 3.91 1 7.5c0 2.3 1.5 4.32 3.76 5.48L3.9 16.1a.25.25 0 0 0 .37.28L8.1 13.9c.29.03.59.05.9.05 4.42 0 8-2.91 8-6.5S13.42 1 9 1Z"
          fill="currentColor"
        />
      </svg>
      카카오로 로그인
    </a>
  );
}
