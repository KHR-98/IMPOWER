"use client";

function lockLoginViewport() {
  const root = document.documentElement;
  root.style.setProperty("--login-lock-height", `${window.innerHeight}px`);
  root.classList.add("kakao-auth-leaving");
}

export function KakaoLoginButton() {
  return (
    <a href="/api/auth/kakao/start" className="button kakao-login-button" onClick={lockLoginViewport}>
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
