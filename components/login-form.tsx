"use client";

import { devLoginAction } from "@/app/login/actions";
import { KakaoLoginButton } from "@/components/kakao-login-button";

interface LoginFormProps {
  devMode?: boolean;
}

const DEV_LOGIN_OPTIONS = [
  { role: "master", label: "마스터" },
  { role: "admin", label: "팀장" },
  { role: "sub_admin", label: "조장" },
  { role: "user", label: "대원" },
] as const;

export function LoginForm({ devMode = false }: LoginFormProps) {
  if (devMode) {
    return (
      <div className="form-stack login-form-stack dev-login-stack">
        {DEV_LOGIN_OPTIONS.map((option) => (
          <form key={option.role} action={devLoginAction}>
            <input type="hidden" name="role" value={option.role} />
            <button type="submit" className="button dev-login-button">
              <span className="dev-login-role">{option.label}</span>
              <span>입장</span>
            </button>
          </form>
        ))}
      </div>
    );
  }

  return (
    <div className="form-stack login-form-stack">
      <KakaoLoginButton />
    </div>
  );
}
