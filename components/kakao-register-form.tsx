"use client";

import { useActionState } from "react";

import { kakaoRegisterAction, type KakaoRegisterState } from "@/app/login/kakao-register/actions";

const initialState: KakaoRegisterState = { error: null };

export function KakaoRegisterForm() {
  const [state, formAction, isPending] = useActionState(kakaoRegisterAction, initialState);

  return (
    <form action={formAction} className="form-stack login-form-stack">
      <div className="field">
        <label htmlFor="displayName">실명 (출결 기록에 표시됩니다)</label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="name"
          placeholder="예: 홍길동"
          maxLength={20}
          autoFocus
        />
      </div>
      <div className="field">
        <label htmlFor="departmentCode">부서 선택</label>
        <select id="departmentCode" name="departmentCode" defaultValue="">
          <option value="" disabled>부서를 선택하세요</option>
          <option value="memory_pcs">메모리PCS</option>
          <option value="foundry_pcs">파운드리PCS</option>
          <option value="memory">메모리</option>
        </select>
      </div>
      {state.error ? <div className="error-box">{state.error}</div> : null}
      <button type="submit" className="button login-submit-button" disabled={isPending}>
        {isPending ? "등록 중..." : "이름 등록 후 입장"}
      </button>
    </form>
  );
}
