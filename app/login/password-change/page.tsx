import Link from "next/link";
import { redirect } from "next/navigation";
import { Space_Grotesk } from "next/font/google";

import { PasswordChangeForm } from "@/components/password-change-form";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";

const passwordTitleFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["700"],
});

export default async function PasswordChangePage() {
  const session = await getSession();

  if (session) {
    redirect(isAdminRole(session.role) ? "/admin" : "/dashboard");
  }

  return (
    <main className="login-shell">
      <section className="login-card stack">
        <div className="login-hero stack">
          <div className="login-hero-copy">
            <span className="brand-kicker">Secure Worksite</span>
            <h1 className={`${passwordTitleFont.className} login-title`}>비밀번호 변경</h1>
          </div>
        </div>
        <PasswordChangeForm />
        <Link href="/login" className="button-subtle login-form-link">
          로그인으로 돌아가기
        </Link>
      </section>
    </main>
  );
}
