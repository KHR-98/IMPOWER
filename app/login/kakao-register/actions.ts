"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { registerKakaoUser } from "@/lib/app-data";
import { createSession } from "@/lib/auth";
import { verifyKakaoPendingToken } from "@/lib/kakao-token";

const KAKAO_PENDING_COOKIE = "kakao_pending";

export interface KakaoRegisterState {
  error: string | null;
}

export async function kakaoRegisterAction(
  _prev: KakaoRegisterState,
  formData: FormData,
): Promise<KakaoRegisterState> {
  const store = await cookies();
  const pendingToken = store.get(KAKAO_PENDING_COOKIE)?.value;

  if (!pendingToken) {
    return { error: "카카오 인증 세션이 만료되었습니다. 다시 로그인해 주세요." };
  }

  const pending = await verifyKakaoPendingToken(pendingToken);
  if (!pending) {
    return { error: "카카오 인증 세션이 만료되었습니다. 다시 로그인해 주세요." };
  }

  const displayName = (formData.get("displayName") as string | null)?.trim() ?? "";
  if (!displayName || displayName.length < 2) {
    return { error: "이름은 2자 이상 입력해주세요." };
  }
  if (displayName.length > 20) {
    return { error: "이름은 20자 이하로 입력해주세요." };
  }

  let user;
  try {
    user = await registerKakaoUser(pending.kakaoId, displayName);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "알 수 없는 오류";
    // Duplicate kakao_id (race condition)
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return { error: "이미 등록된 카카오 계정입니다. 다시 로그인해 주세요." };
    }
    return { error: `계정 생성 중 오류가 발생했습니다: ${msg}` };
  }

  store.delete(KAKAO_PENDING_COOKIE);
  await createSession(user);
  redirect("/dashboard");
}
