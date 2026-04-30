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
            <span className="brand-kicker">{isAdmin ? "아임파워(주)" : "Check In"}</span>
            <span className={`brand-title${isAdmin ? "" : " brand-title-compact"}`}>
              {isAdmin ? "IM-ON" : "출석체크"}
            </span>
          </div>
          <div className="nav-links">
            {!isAdmin ? (
              <form action={logoutAction}>
                <button type="submit" className="button-ghost logout-icon-btn" aria-label="로그아웃" title="로그아웃">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
              </form>
            ) : null}
          </div>
        </header>
        {isAdmin ? (
          <div className="view-toggle-fixed">
            <form action={logoutAction}>
              <button type="submit" className="button-ghost logout-icon-btn" aria-label="로그아웃" title="로그아웃">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </form>
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
