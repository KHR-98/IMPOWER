"use client";

import { useActionState } from "react";

import { changePasswordAction, type PasswordChangeState } from "@/app/login/actions";

const initialState: PasswordChangeState = {
  error: null,
  success: null,
};

export function PasswordChangeForm() {
  const [state, formAction, isPending] = useActionState(changePasswordAction, initialState);

  return (
    <section className="login-password-panel stack">
      <div className="login-password-copy">
        <h2 className="section-title">비밀번호 변경</h2>
        <p className="section-subtitle">초기 비밀번호로 로그인했다면 바로 새 비밀번호로 바꿔주세요.</p>
      </div>
      <form action={formAction} className="form-stack login-form-stack">
        <div className="field">
          <label htmlFor="change-username">아이디</label>
          <input id="change-username" name="username" type="text" autoComplete="username" placeholder="아이디를 입력하세요" />
        </div>
        <div className="field">
          <label htmlFor="current-password">현재 비밀번호</label>
          <input
            id="current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            placeholder="현재 비밀번호를 입력하세요"
          />
        </div>
        <div className="field">
          <label htmlFor="next-password">새 비밀번호</label>
          <input id="next-password" name="nextPassword" type="password" autoComplete="new-password" placeholder="새 비밀번호를 입력하세요" />
        </div>
        <div className="field">
          <label htmlFor="confirm-password">새 비밀번호 확인</label>
          <input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="새 비밀번호를 다시 입력하세요"
          />
        </div>
        {state.error ? <div className="error-box">{state.error}</div> : null}
        {state.success ? <div className="notice">{state.success}</div> : null}
        <button type="submit" className="button-subtle login-secondary-button" disabled={isPending}>
          {isPending ? "변경 중..." : "비밀번호 변경"}
        </button>
      </form>
    </section>
  );
}
