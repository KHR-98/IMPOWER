import { Suspense } from "react";

import { ViewToggle } from "@/components/view-toggle";
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
              {isAdmin ? "IM-ON" : "출석체크"}
            </span>
          </div>
          <div className="nav-links">
            <form action={logoutAction}>
              <button type="submit" className="button-ghost">
                로그아웃
              </button>
            </form>
          </div>
        </header>
        {isAdmin ? (
          <div className="view-toggle-fixed">
            <Suspense>
              <ViewToggle />
            </Suspense>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
