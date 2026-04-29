import Link from "next/link";

import { requireSession } from "@/lib/auth";

import { logoutAction } from "./actions";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireSession();
  const isAdmin = session.role === "admin" || session.role === "sub_admin";

  return (
    <div className="shell">
      <div className="container">
        <header className={`topbar${isAdmin ? "" : " topbar-compact"}`}>
          <div className="brand">
            <span className="brand-kicker">{isAdmin ? "Attendance System" : "Check In"}</span>
            <span className={`brand-title${isAdmin ? "" : " brand-title-compact"}`}>
              {isAdmin ? "출퇴근통합시스템" : "출석체크"}
            </span>
          </div>
          <div className="nav-links">
            {isAdmin ? (
              <>
                <Link href="/dashboard?view=user" className="nav-link">
                  사용자 화면
                </Link>
                <Link href="/admin" className="nav-link">
                  관리자 화면
                </Link>
              </>
            ) : null}
            <form action={logoutAction}>
              <button type="submit" className="button-ghost">
                로그아웃
              </button>
            </form>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
