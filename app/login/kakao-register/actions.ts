"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { registerKakaoUser } from "@/lib/app-data";
import { createSession } from "@/lib/auth";
import { INVITE_LINK_COOKIE } from "@/lib/invite-link-cookie";
import { verifyKakaoPendingToken } from "@/lib/kakao-token";

const KAKAO_PENDING_COOKIE = "kakao_pending";

export interface KakaoRegisterState {
  error: string | null;
}

interface RegisterErrorDetails {
  name?: string;
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  stack?: string;
}

function getStringField(source: Record<string, unknown>, key: keyof RegisterErrorDetails): string | undefined {
  const value = source[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getRegisterErrorDetails(err: unknown): RegisterErrorDetails {
  if (err instanceof Error) {
    const details: RegisterErrorDetails = {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };

    if ("code" in err && typeof err.code === "string") {
      details.code = err.code;
    }

    return details;
  }

  if (err && typeof err === "object") {
    const error = err as Record<string, unknown>;
    return {
      name: getStringField(error, "name"),
      code: getStringField(error, "code"),
      message: getStringField(error, "message"),
      details: getStringField(error, "details"),
      hint: getStringField(error, "hint"),
      stack: getStringField(error, "stack"),
    };
  }

  if (typeof err === "string" && err.trim()) {
    return { message: err };
  }

  return {};
}

function getErrorMessage(err: unknown): string {
  const error = getRegisterErrorDetails(err);
  const parts = [
    error.code ? `코드 ${error.code}` : null,
    error.message,
    error.details,
    error.hint ? `힌트: ${error.hint}` : null,
  ];

  return parts.filter(Boolean).join(" / ") || "알 수 없는 오류";
}

function maskIdentifier(value: string): string {
  if (value.length <= 4) {
    return "****";
  }

  return `${"*".repeat(Math.min(value.length - 4, 8))}${value.slice(-4)}`;
}

function logRegisterError(err: unknown, input: { kakaoId: string; displayName: string }): void {
  const details = getRegisterErrorDetails(err);
  console.error("[kakao-register] account creation failed", {
    kakaoId: maskIdentifier(input.kakaoId),
    displayNameLength: input.displayName.length,
    error: details,
  });
}

function isDuplicateAccountError(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes("duplicate") ||
    lowerMessage.includes("unique") ||
    lowerMessage.includes("23505")
  );
}

function getUserFacingRegisterError(err: unknown): string {
  const msg = getErrorMessage(err);
  if (isDuplicateAccountError(msg)) {
    return "이미 등록된 카카오 계정입니다. 다시 로그인해 주세요.";
  }

  return `계정 생성 중 오류가 발생했습니다: ${msg}`;
}

function getUnknownErrorMessage(): string {
  return "알 수 없는 오류";
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

  const inviteToken = store.get(INVITE_LINK_COOKIE)?.value;
  if (!inviteToken) {
    return { error: "초대링크로 접속한 뒤 가입해주세요." };
  }

  let user;
  try {
    user = await registerKakaoUser(pending.kakaoId, displayName, inviteToken);
  } catch (err) {
    logRegisterError(err, { kakaoId: pending.kakaoId, displayName });
    const error = getUserFacingRegisterError(err);
    return { error: error || `계정 생성 중 오류가 발생했습니다: ${getUnknownErrorMessage()}` };
  }

  store.delete(KAKAO_PENDING_COOKIE);
  store.delete(INVITE_LINK_COOKIE);
  await createSession(user);
  redirect("/dashboard");
}
