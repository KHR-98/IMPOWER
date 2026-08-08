import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AllPeriodsExpanded } from "@/components/all-periods-drawer";
import type { AllPeriodsRow } from "@/components/all-periods-drawer";
import { AttendanceRosterCopyButton } from "@/components/attendance-roster-copy-button";
import { getDashboardView, getDepartments } from "@/lib/app-data";
import { requireAdminView } from "@/lib/auth";
import { hasCurrentConsent } from "@/lib/consent-store";
import { canSelectAnyDepartment } from "@/lib/permissions";
import { filterLunchTbmLabels } from "@/lib/department-feature-policy";
import { isFrontendOnlyDepartmentId } from "@/lib/frontend-department-overrides";
import { buildRosterText } from "@/lib/roster-copy-text";
import { getKoreaDateSlashLabel } from "@/lib/time";

// 운영(viewer)·마스터 전용 출력 화면: 출력현황(전체 출결표)과 출력인원명단(복사/미리보기)만 모아 보여준다.
// 쓰기 기능은 없다 — 부서 열람 권한(canSelectAnyDepartment)만 통과시키고 나머지는 관리자 콘솔로 돌린다.
export default async function AdminOutputPage({
  searchParams,
}: {
  searchParams?: Promise<{ departmentId?: string }>;
}) {
  const session = await requireAdminView();

  // 전체 부서 열람 권한(master·viewer)만 이 화면을 쓴다. 팀장/조장은 관리자 콘솔로.
  if (!canSelectAnyDepartment(session.role)) {
    redirect("/admin");
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  if (!(await hasCurrentConsent(session.username))) {
    const next = resolvedSearchParams?.departmentId
      ? `/admin/output?departmentId=${encodeURIComponent(resolvedSearchParams.departmentId)}`
      : "/admin/output";
    redirect(`/consent?next=${encodeURIComponent(next)}`);
  }

  const departments = await getDepartments();
  // 조회할 실제 데이터가 없는 프론트 전용 placeholder 부서(ITC·인프라 등)는 선택지에서 제외한다.
  const selectableDepartments = departments.filter(
    (department) => department.isActive && !isFrontendOnlyDepartmentId(department.id),
  );
  const selectedDepartment =
    selectableDepartments.find((department) => department.id === resolvedSearchParams?.departmentId) ??
    selectableDepartments[0] ??
    null;

  if (!selectedDepartment) {
    return (
      <main className="stack admin-console">
        <div className="notice small">조회할 부서가 없습니다.</div>
      </main>
    );
  }

  // URL의 departmentId를 실제 선택 부서로 정규화한다. 명단복사 버튼은 URL의 departmentId만 보고
  // 서버에 요청하므로, 화면 미리보기와 복사 결과가 어긋나지 않도록 항상 유효한 값을 URL에 실어둔다.
  if (resolvedSearchParams?.departmentId !== selectedDepartment.id) {
    redirect(`/admin/output?departmentId=${encodeURIComponent(selectedDepartment.id)}`);
  }

  const dashboard = await getDashboardView(selectedDepartment.id);
  const departmentCode = selectedDepartment.code;

  // 출력현황: 오늘 근무예정자 전원의 전 구간 출결표(관리자 콘솔의 "전체 출결표"와 동일 구성).
  const scheduledRows = dashboard.scheduledUsers.filter((entry) => entry.isScheduled);
  const allPeriodsRows: AllPeriodsRow[] = scheduledRows.map((entry) => {
    const record = dashboard.rows.find((row) => row.username === entry.username);
    const items =
      entry.shiftType === "day"
        ? [
            { label: "출근", done: !!record?.checkIn, occurredAt: record?.checkIn?.occurredAt ?? null },
            { label: "오전 TBM", done: !!(record?.tbmMorning ?? record?.tbm), occurredAt: (record?.tbmMorning ?? record?.tbm)?.occurredAt ?? null },
            { label: "오후 TBM", done: !!record?.tbmAfternoon, occurredAt: record?.tbmAfternoon?.occurredAt ?? null },
            { label: "퇴근 TBM", done: !!record?.tbmCheckout, occurredAt: record?.tbmCheckout?.occurredAt ?? null },
            { label: "퇴근", done: !!record?.checkOut, occurredAt: record?.checkOut?.occurredAt ?? null },
          ]
        : [
            { label: "출근", done: !!record?.checkIn, occurredAt: record?.checkIn?.occurredAt ?? null },
            { label: "퇴근", done: !!record?.checkOut, occurredAt: record?.checkOut?.occurredAt ?? null },
          ];
    return {
      username: entry.username,
      displayName: entry.displayName,
      shiftType: entry.shiftType,
      items: filterLunchTbmLabels(items, departmentCode),
    };
  });

  const checkedInCount = scheduledRows.filter(
    (entry) => dashboard.rows.find((row) => row.username === entry.username)?.checkIn,
  ).length;
  const notCheckedInCount = scheduledRows.length - checkedInCount;

  // 출력인원명단: 명단복사 버튼이 호출하는 것과 동일한 텍스트를 화면에도 그대로 미리보기로 렌더.
  const rosterText = buildRosterText(dashboard.scheduledUsers, selectedDepartment.name, dashboard.dateKey);

  const buildHref = (departmentId: string) =>
    `/admin/output?departmentId=${encodeURIComponent(departmentId)}`;

  return (
    <main className="stack admin-console">
      <section className="admin-page-header">
        <div className="admin-page-heading">
          <span className="brand-kicker">출력 현황 · 명단</span>
        </div>
      </section>

      {selectableDepartments.length > 1 ? (
        <nav className="inline-row account-department-filter-list" aria-label="부서 선택">
          {selectableDepartments.map((department) => (
            <Link
              key={department.id}
              href={buildHref(department.id)}
              className={`${department.id === selectedDepartment.id ? "button" : "button-subtle"} account-department-filter-button`}
              scroll={false}
            >
              {department.name}
            </Link>
          ))}
        </nav>
      ) : null}

      <section className="glass-panel admin-hero-panel">
        <div className="admin-hero-copy">
          <span className="brand-kicker">출력 현황</span>
          <h1>{getKoreaDateSlashLabel()} {selectedDepartment.name}</h1>
        </div>
        <div className="admin-hero-meta">
          <div className="admin-hero-stat">
            <span className="caption">전체인원</span>
            <strong>{scheduledRows.length}명</strong>
          </div>
          <div className="admin-hero-stat">
            <span className="caption">출근완료</span>
            <strong>{checkedInCount}명</strong>
          </div>
          <div className="admin-hero-stat">
            <span className="caption">미출근</span>
            <strong>{notCheckedInCount}명</strong>
          </div>
        </div>
      </section>

      <section className="stack admin-overview-section">
        <article className="table-panel stack admin-detail-panel">
          <div className="panel-header">
            <h2 className="section-title">출력인원명단</h2>
            <Suspense>
              <AttendanceRosterCopyButton />
            </Suspense>
          </div>
          <pre className="roster-preview" style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "inherit" }}>
            {rosterText}
          </pre>
        </article>

        <article className="table-panel stack admin-detail-panel">
          <div className="panel-header">
            <h2 className="section-title">전체 출결표</h2>
          </div>
          {allPeriodsRows.length > 0 ? (
            <AllPeriodsExpanded rows={allPeriodsRows} />
          ) : (
            <div className="notice small">표시할 출결 대상자가 없습니다.</div>
          )}
        </article>
      </section>
    </main>
  );
}
