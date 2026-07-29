import { redirect } from "next/navigation";
import { Space_Grotesk } from "next/font/google";

import { LoginForm } from "@/components/login-form";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";

const loginTitleFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["700"],
});

const KAKAO_ERROR_MESSAGES: Record<string, string> = {
  kakao_config: "카카오 로그인 설정이 필요합니다. KAKAO_REST_API_KEY 값을 확인해주세요.",
  kakao_credentials: "카카오 REST API 키 또는 Client Secret 설정이 올바르지 않습니다.",
  kakao_cancelled: "카카오 로그인이 취소되었습니다.",
  kakao_token: "카카오 인증 중 오류가 발생했습니다. 다시 시도해주세요.",
  kakao_profile: "카카오 프로필 정보를 가져오지 못했습니다. 다시 시도해주세요.",
  invite_required: "가입은 초대링크로만 가능합니다. 전달받은 초대링크로 다시 접속해주세요.",
  invite_invalid: "초대링크가 유효하지 않거나 만료되었습니다.",
  department_locked: "메모리 부서는 현재 이용할 수 없습니다. 관리자에게 문의하세요.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await getSession();

  if (session) {
    redirect(isAdminRole(session.role) ? "/admin" : "/dashboard");
  }

  const { error: errorCode } = await searchParams;
  const isDevLogin = process.env.NODE_ENV !== "production";
  const kakaoError = !isDevLogin && errorCode ? (KAKAO_ERROR_MESSAGES[errorCode] ?? null) : null;

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-brand-strip">
          <span className={`${loginTitleFont.className} login-title`}>주연SNC</span>
          <p className="login-subtitle">주연SNC 출결 관리</p>
        </div>
        <div className="login-body">
          {kakaoError ? (
            <div className="error-box">
              <div>{kakaoError}</div>
            </div>
          ) : null}
          <p className="login-guide">
            {isDevLogin ? "개발 모드 계정을 선택하세요." : "카카오 계정으로 간편하게 로그인하세요"}
          </p>
          <LoginForm devMode={isDevLogin} />
        </div>
      </section>
    </main>
  );
}
