"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useEffect, useState } from "react";

import { loginAction, type LoginState } from "@/app/login/actions";

const initialState: LoginState = {
  error: null,
};

const REMEMBER_ENABLED_KEY = "pcs-axis-remember-enabled";
const REMEMBER_CREDENTIALS_KEY = "pcs-axis-remember-credentials";

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberCredentials, setRememberCredentials] = useState(false);

  useEffect(() => {
    const enabled = window.localStorage.getItem(REMEMBER_ENABLED_KEY) === "true";
    const raw = window.localStorage.getItem(REMEMBER_CREDENTIALS_KEY);

    setRememberCredentials(enabled);

    if (!enabled || !raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as { username?: string; password?: string };
      setUsername(parsed.username ?? "");
      setPassword(parsed.password ?? "");
    } catch {
      window.localStorage.removeItem(REMEMBER_CREDENTIALS_KEY);
      window.localStorage.removeItem(REMEMBER_ENABLED_KEY);
      setRememberCredentials(false);
    }
  }, []);

  function handleRememberToggle(nextValue: boolean) {
    setRememberCredentials(nextValue);
    window.localStorage.setItem(REMEMBER_ENABLED_KEY, String(nextValue));

    if (nextValue) {
      if (username.trim() && password.trim()) {
        window.localStorage.setItem(
          REMEMBER_CREDENTIALS_KEY,
          JSON.stringify({
            username,
            password,
          }),
        );
      }
    } else {
      window.localStorage.removeItem(REMEMBER_CREDENTIALS_KEY);
    }
  }

  return (
    <form action={formAction} className="form-stack login-form-stack">
      <div className="field">
        <label htmlFor="username">아이디</label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          placeholder="아이디를 입력하세요"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="password">비밀번호</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="비밀번호를 입력하세요"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      {state.error ? <div className="error-box">{state.error}</div> : null}
      <button type="submit" className="button login-submit-button" disabled={isPending}>
        {isPending ? "로그인 중..." : "로그인"}
      </button>
      <div className="login-save-row">
        <label className="login-save-toggle">
          <input type="checkbox" checked={rememberCredentials} onChange={(event) => handleRememberToggle(event.target.checked)} />
          <span>ID/PASSWORD 저장</span>
        </label>
      </div>
      <Link href="/login/password-change" className="button-subtle login-form-link">
        비밀번호 변경
      </Link>
    </form>
  );
}
