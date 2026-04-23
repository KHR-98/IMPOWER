import { redirect } from "next/navigation";
import { Space_Grotesk } from "next/font/google";

import { LoginForm } from "@/components/login-form";
import { getRuntimeInfo } from "@/lib/app-data";
import { getSession } from "@/lib/auth";

const loginTitleFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["700"],
});

const KAKAO_ERROR_MESSAGES: Record<string, string> = {
  kakao_cancelled: "카카오 로그인이 취소되었습니다.",
  kakao_token: "카카오 인증 중 오류가 발생했습니다. 다시 시도해주세요.",
  kakao_profile: "카카오 프로필 정보를 가져오지 못했습니다. 다시 시도해주세요.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await getSession();

  if (session) {
    redirect(session.role === "admin" ? "/admin" : "/dashboard");
  }

  const runtime = await getRuntimeInfo();
  const { error: errorCode } = await searchParams;
  const kakaoError = errorCode ? (KAKAO_ERROR_MESSAGES[errorCode] ?? null) : null;

  return (
    <main className="login-shell">
      <section className="login-card stack">
        <div className="login-hero stack">
          <div className="login-hero-copy">
            <span className="brand-kicker">Secure Worksite</span>
            <h1 className={`${loginTitleFont.className} login-title`}>PCS Axis</h1>
          </div>
        </div>
        {runtime.demoCredentials ? (
          <div className="info-box small login-account-box">
            <div className="login-account-title">테스트 계정</div>
            <div className="login-account-list">
              <div className="login-account-item">
                <strong>관리자</strong>
                <span>
                  {runtime.demoCredentials.admin.username} / {runtime.demoCredentials.admin.password}
                </span>
              </div>
              <div className="login-account-item">
                <strong>사용자</strong>
                <span>
                  {runtime.demoCredentials.user.username} / {runtime.demoCredentials.user.password}
                </span>
              </div>
            </div>
          </div>
        ) : null}
        {runtime.setupMessage ? (
          <div className="error-box">
            <div>{runtime.setupMessage}</div>
          </div>
        ) : null}
        {kakaoError ? (
          <div className="error-box">
            <div>{kakaoError}</div>
          </div>
        ) : null}
        <LoginForm />
      </section>
    </main>
  );
}
