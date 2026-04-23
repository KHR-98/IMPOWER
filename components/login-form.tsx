"use client";

import { KakaoLoginButton } from "@/components/kakao-login-button";

export function LoginForm() {
  return (
    <div className="form-stack login-form-stack">
      <KakaoLoginButton />
    </div>
  );
}
