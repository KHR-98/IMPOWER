import { redirect } from "next/navigation";
import { Space_Grotesk } from "next/font/google";

import { LoginForm } from "@/components/login-form";
import { getSession } from "@/lib/auth";

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
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await getSession();
  const isDevelopment = process.env.NODE_ENV === "development";

  if (session) {
    redirect(session.role === "admin" || session.role === "sub_admin" || session.role === "master" ? "/admin" : "/dashboard");
  }

  const { error: errorCode } = await searchParams;
  const kakaoError = errorCode ? (KAKAO_ERROR_MESSAGES[errorCode] ?? null) : null;

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-brand-strip">
          <span className={`${loginTitleFont.className} login-title`}>IMPOWER</span>
          <p className="login-subtitle">아임파워(주) 출결 관리</p>
        </div>
        <div className="login-body">
          {kakaoError ? (
            <div className="error-box">
              <div>{kakaoError}</div>
            </div>
          ) : null}
          <p className="login-guide">카카오 계정으로 간편하게 로그인하세요</p>
          {isDevelopment ? (
            <div className="form-stack login-form-stack">
              <a href="/api/dev/login?role=admin" className="button login-submit-button">
                관리자 화면 열기
              </a>
              <a href="/api/dev/login?role=sub_admin" className="button-subtle login-secondary-button">
                부관리자 화면 열기
              </a>
              <a href="/api/dev/login?role=user" className="button-subtle login-secondary-button">
                사용자 화면 열기
              </a>
            </div>
          ) : (
            <LoginForm />
          )}
        </div>
      </section>
    </main>
  );
}
