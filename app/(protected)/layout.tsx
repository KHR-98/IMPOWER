import { Suspense } from "react";
import Image from "next/image";

import { AdminExportPanel } from "@/components/admin-export-panel";
import { AttendanceRosterCopyButton } from "@/components/attendance-roster-copy-button";
import { ViewToggle } from "@/components/view-toggle";
import { getDepartments, getSessionUserByUsername } from "@/lib/app-data";
import { requireSession } from "@/lib/auth";
import { canSelectAnyDepartment, isAdminRole } from "@/lib/permissions";

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
  // ViewToggle(관리↔사용자 전환)은 실제 관리자 3종만. viewer는 사용자 화면이 없으므로 제외.
  const isAdmin = isAdminRole(session.role);
  // 명단복사(출력인원 열람)는 전체 부서 조회 역할(master·viewer)에게 노출.
  const canViewOutput = canSelectAnyDepartment(session.role);
  // 엑셀 내려받기는 viewer(열람 전용) 제외. 사실상 master만.
  const canExport = canViewOutput && session.role !== "viewer";
  const [dbUser, departments] = await Promise.all([
    getSessionUserByUsername(session.username),
    getDepartments(),
  ]);
  const deptName = dbUser?.departmentId
    ? (departments.find((d) => d.id === dbUser.departmentId)?.name ?? null)
    : null;

  return (
    <div className="shell">
      <div className="container">
        <header className="topbar">
          <div className="brand">
            <div className="brand-kicker-row brand-logo-row">
              <Image
                src="/brand/jyon-logo.png"
                alt="JY:ON"
                className="brand-logo"
                width={1934}
                height={504}
                sizes="(max-width: 400px) 128px, (max-width: 780px) 148px, 168px"
                priority
              />
            </div>
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
            {canExport ? <AdminExportPanel /> : null}
          </div>
        </div>
        {/* 마스터: 출결 명단복사를 상단 엑셀 버튼 왼쪽(기존 위치)에 둔다. 뷰어는 엑셀이 없어 admin nav에 표시. */}
        {canExport ? (
          <div className="topbar-copy-fixed">
            <Suspense>
              <AttendanceRosterCopyButton />
            </Suspense>
          </div>
        ) : null}
        <span className="watermark-text">© 2026 권순범 · 김형래. All rights reserved.</span>

        {children}
      </div>
    </div>
  );
}
