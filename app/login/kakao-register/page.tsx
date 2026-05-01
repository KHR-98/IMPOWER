import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Space_Grotesk } from "next/font/google";

import { verifyKakaoPendingToken } from "@/lib/kakao-token";
import { KakaoRegisterForm } from "@/components/kakao-register-form";

const loginTitleFont = Space_Grotesk({ subsets: ["latin"], weight: ["700"] });

const KAKAO_PENDING_COOKIE = "kakao_pending";

export default async function KakaoRegisterPage() {
  const store = await cookies();
  const pendingToken = store.get(KAKAO_PENDING_COOKIE)?.value;

  if (!pendingToken) {
    redirect("/login");
  }

  const pending = await verifyKakaoPendingToken(pendingToken);
  if (!pending) {
    redirect("/login");
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-brand-strip">
          <h1 className={`${loginTitleFont.className} login-title`}>PCS Axis</h1>
          <p className="login-subtitle">Secure Worksite</p>
        </div>
        <div className="login-body">
          <div className="info-box small">
          <strong>카카오 계정 연동</strong>
            <p style={{ marginTop: 4, fontSize: "0.875rem" }}>
            카카오 닉네임: <strong>{pending.kakaoNickname || "없음"}</strong>
            </p>
            <p style={{ marginTop: 2, fontSize: "0.875rem", color: "var(--muted)" }}>
            출결 시스템에 표시될 실명을 입력해주세요. 최초 1회만 입력합니다.
            </p>
          </div>
          <KakaoRegisterForm />
        </div>
      </section>
    </main>
  );
}
