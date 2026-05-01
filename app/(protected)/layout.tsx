import { Suspense } from "react";

import { ViewToggle } from "@/components/view-toggle";
import { getDepartments } from "@/lib/app-data";
import { requireSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";

import { logoutAction } from "./actions";

const LogoutIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireSession();
  const isAdmin = isAdminRole(session.role);
  const departments = session.departmentId ? await getDepartments() : [];
  const deptName = departments.find((d) => d.id === session.departmentId)?.name ?? null;

  return (
    <div className="shell">
      <div className="container">
        <header className="topbar">
          <div className="brand">
            <span className="brand-kicker">아임파워(주)</span>
            <span className="brand-title">IM-ON</span>
            {deptName && (
              <span style={{ fontSize: "0.72rem", color: "var(--fg-muted)", marginTop: 2 }}>
                {deptName}
              </span>
            )}
          </div>
        </header>

        <div className="view-toggle-fixed">
          {isAdmin ? (
            <Suspense>
              <ViewToggle />
            </Suspense>
          ) : null}
          <form action={logoutAction}>
            <button type="submit" className="button-ghost logout-icon-btn" aria-label="로그아웃" title="로그아웃">
              <LogoutIcon />
            </button>
          </form>
        </div>

        {children}
      </div>
    </div>
  );
}
