import { Suspense } from "react";

import { ViewToggle } from "@/components/view-toggle";
import { getDepartments, getSessionUserByUsername } from "@/lib/app-data";
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

const ExcelExportIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M7 3.5h7.2L19 8.3v12.2H7z" />
    <path d="M14 3.5v5h5" />
    <path d="M4 8.5h8v8H4z" />
    <path d="m6.2 10.5 3.6 4" />
    <path d="m9.8 10.5-3.6 4" />
  </svg>
);

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireSession();
  const isAdmin = isAdminRole(session.role);
  const [dbUser, departments] = await Promise.all([
    getSessionUserByUsername(session.username),
    getDepartments(),
  ]);
  const deptName = dbUser?.departmentId
    ? (departments.find((d) => d.id === dbUser.departmentId)?.name ?? null)
    : null;
  const attendanceExportLinks = session.role === "master"
    ? [
        { label: "전체", href: "/api/admin/attendance-export?departmentId=all" },
        ...departments.map((department) => ({
          label: department.name,
          href: `/api/admin/attendance-export?departmentId=${encodeURIComponent(department.id)}`,
        })),
      ]
    : [];

  return (
    <div className="shell">
      <div className="container">
        <header className="topbar">
          <div className="brand">
            <div className="brand-kicker-row">
              <span className="brand-kicker">아임파워(주)</span>
              {attendanceExportLinks.length > 0 ? (
                <details className="admin-export-actions brand-export-actions">
                  <summary className="admin-export-trigger" aria-label="엑셀 다운로드" title="엑셀 다운로드">
                    <span className="admin-export-icon">
                      <ExcelExportIcon />
                    </span>
                  </summary>
                  <div className="admin-export-options" aria-label="출결 엑셀 다운로드">
                    {attendanceExportLinks.map((link) => (
                      <a key={link.href} className="admin-export-link" href={link.href} download>
                        {link.label}
                      </a>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
            <span className="brand-title">IM-ON</span>
            {deptName && (
              <span className="brand-department-chip" title={`소속 부서: ${deptName}`}>
                <span className="brand-department-dot" aria-hidden="true" />
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
          <div className="topbar-action-stack">
            <form action={logoutAction}>
              <button type="submit" className="button-ghost logout-icon-btn" aria-label="로그아웃" title="로그아웃">
                <LogoutIcon />
              </button>
            </form>
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}
