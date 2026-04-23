import { redirect } from "next/navigation";
import { Space_Grotesk } from "next/font/google";

import { LoginForm } from "@/components/login-form";
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
