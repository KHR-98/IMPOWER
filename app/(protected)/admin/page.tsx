import Link from "next/link";

import { AdminAttendanceCorrectionPanel } from "@/components/admin-attendance-correction-panel";
import { AdminRefreshButton } from "@/components/admin-refresh-button";
import { AllPeriodsExpanded, AllPeriodsTrigger } from "@/components/all-periods-drawer";
import type { AllPeriodsRow } from "@/components/all-periods-drawer";
import { AdminRosterSyncPanel } from "@/components/admin-roster-sync-panel";
import { AdminSettingsPanel } from "@/components/admin-settings-panel";
import { AdminUserManagementPanel } from "@/components/admin-user-management-panel";
import { AttendanceManagementPanel } from "@/components/attendance-management-panel";
import { getAdminUserList, getDashboardView, getDevCoordinatesForTesting, getRuntimeInfo, getUserTodayView } from "@/lib/app-data";
import { requireAdmin } from "@/lib/auth";
import { buildCurrentPeriodOperatorRows } from "@/lib/current-period";
import { formatKoreaDateTime, getKoreaDateSlashLabel } from "@/lib/time";
import type { RosterReasonCode } from "@/lib/types";

type AdminSectionKey = "overview" | "users" | "accounts" | "system";

const ADMIN_SECTION_OPTIONS: Array<{ key: AdminSectionKey; label: string }> = [
  { key: "overview", label: "오늘 현황" },
  { key: "users", label: "근태 관리" },
  { key: "accounts", label: "계정 관리" },
  { key: "system", label: "시스템 설정" },
];

function normalizeAdminSection(section: string | undefined): AdminSectionKey {
  if (section === "users" || section === "accounts" || section === "system") {
    return section;
  }

  return "overview";
}


const SPECIAL_CASE_ORDER: RosterReasonCode[] = ["leave", "half_day_am", "half_day_pm", "half_day", "military", "blocked"];
function getSpecialCaseLabel(code: RosterReasonCode): string {
  switch (code) {
    case "leave":
      return "연차";
    case "half_day_am":
      return "오전 반차";
    case "half_day_pm":
      return "오후 반차";
    case "half_day":
      return "반차";
    case "military":
      return "예비군";
    case "blocked":
      return "예외/제외";
    case "holiday":
      return "휴일 제외";
    default:
      return code;
  }
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ section?: string; focus?: string; allPeriods?: string }>;
}) {
  const session = await requireAdmin();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const selectedSection = normalizeAdminSection(resolvedSearchParams?.section);
  const showAllPeriods = resolvedSearchParams?.allPeriods === "1";
  const [dashboard, runtime, adminUsers, adminTodayView, devCoordinates] = await Promise.all([
    getDashboardView(),
    getRuntimeInfo(),
    getAdminUserList(),
    selectedSection === "overview" ? getUserTodayView(session.username) : Promise.resolve(null),
    selectedSection === "overview" ? getDevCoordinatesForTesting() : Promise.resolve(null),
  ]);
  const currentPeriodRows = buildCurrentPeriodOperatorRows({
    rows: dashboard.rows,
    scheduledUsers: dashboard.scheduledUsers,
    periodCode: dashboard.currentPeriod.code,
  });
  const currentPeriodLabels =
    dashboard.currentPeriodStats.length > 0
      ? dashboard.currentPeriodStats.map((stat) => stat.label)
      : currentPeriodRows[0]?.statuses.map((status) => status.label) ?? [];
  const currentPeriodPendingTotal = dashboard.currentPeriodStats.reduce((sum, stat) => sum + stat.pendingCount, 0);
  const currentPeriodPendingPeople = currentPeriodRows.filter((row) => row.statuses.some((s) => !s.occurredAt)).length;
  const currentPeriodCompletedPeople = currentPeriodRows.length - currentPeriodPendingPeople;
  const specialCaseSourceRows = dashboard.scheduledUsers;
  const specialCaseGroups = SPECIAL_CASE_ORDER.map((reasonCode) => {
    const names = specialCaseSourceRows
      .filter((entry) => entry.scheduleReasonCode === reasonCode)
      .map((entry) => entry.displayName);

    return {
      reasonCode,
      label: getSpecialCaseLabel(reasonCode),
      names,
    };
  }).filter((group) => group.names.length > 0);
  const periodTableLabels = currentPeriodLabels;
  const periodTableRows = currentPeriodRows;
  const currentPeriodGridTemplate = `1.15fr repeat(${Math.max(periodTableLabels.length, 1)}, minmax(0, 1fr))`;
  const buildAllPeriodsRow = (u: { username: string; displayName: string; shiftType: "day" | "late" }, record: typeof dashboard.rows[number] | undefined): AllPeriodsRow => ({
    username: u.username,
    displayName: u.displayName,
    shiftType: u.shiftType,
    items: u.shiftType === "day"
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
        ],
  });

  const scheduledRows = dashboard.scheduledUsers.filter((u) => u.isScheduled);
  const liveAllPeriodsRows: AllPeriodsRow[] = scheduledRows.map((u) =>
    buildAllPeriodsRow(u, dashboard.rows.find((r) => r.username === u.username))
  );

  const allPeriodsIsPreview = liveAllPeriodsRows.length === 0;
  const allPeriodsRows: AllPeriodsRow[] = allPeriodsIsPreview
    ? dashboard.scheduledUsers.length > 0
      ? dashboard.scheduledUsers.slice(0, 8).map((u) =>
          buildAllPeriodsRow(u, dashboard.rows.find((r) => r.username === u.username))
        )
      : [
          { username: "ex-day-1", displayName: "김현장", shiftType: "day", items: [{ label: "출근", done: true }, { label: "오전 TBM", done: true }, { label: "오후 TBM", done: false }, { label: "퇴근 TBM", done: false }, { label: "퇴근", done: false }] },
          { username: "ex-day-2", displayName: "박작업", shiftType: "day", items: [{ label: "출근", done: true }, { label: "오전 TBM", done: false }, { label: "오후 TBM", done: false }, { label: "퇴근 TBM", done: false }, { label: "퇴근", done: false }] },
          { username: "ex-late-1", displayName: "이늦조", shiftType: "late", items: [{ label: "출근", done: false }, { label: "퇴근", done: false }] },
        ]
    : liveAllPeriodsRows;

  const periodLabel = dashboard.currentPeriod.label;
  const periodTableTitle =
    dashboard.currentPeriod.code === "none"
      ? "현재 출결표"
      : periodLabel.includes("늦조")
      ? "늦조 시간대 출결표"
      : periodLabel.includes("주간조")
      ? "주간조 시간대 출결표"
      : `${periodLabel} 출결표`;

  return (
    <main className="stack admin-console">
      {runtime.setupMessage ? <div className="error-box">{runtime.setupMessage}</div> : null}

      <section className="admin-page-header">
        <div className="admin-page-heading">
          <span className="brand-kicker">Admin Console</span>
          <h1 className="admin-page-title">관리자 대시보드</h1>
        </div>

        <nav className="admin-section-nav admin-section-nav-top" aria-label="관리자 화면 구역 전환">
          {ADMIN_SECTION_OPTIONS.map((option) => (
            <Link
              key={option.key}
              href={option.key === "overview" ? "/admin" : `/admin?section=${option.key}`}
              className={`admin-section-link${selectedSection === option.key ? " admin-section-link-active" : ""}`}
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </section>

      {selectedSection === "overview" ? (
        <>
        <section className="glass-panel admin-hero-panel">
          <div className="admin-hero-copy">
            <span className="brand-kicker">실시간 운영 콘솔</span>
            <h1>{getKoreaDateSlashLabel()} {dashboard.currentPeriod.label}</h1>
          </div>
          <div className="admin-hero-meta">
            <div className="admin-hero-stat">
              <span className="caption">전체인원</span>
              <strong>{currentPeriodRows.length}명</strong>
            </div>
            <div className="admin-hero-stat">
              <span className="caption">완료</span>
              <strong>{currentPeriodCompletedPeople}명</strong>
            </div>
            <div className="admin-hero-stat">
              <span className="caption">미완료</span>
              <strong>{currentPeriodPendingPeople}명</strong>
            </div>
          </div>
        </section>


        <section className="stack admin-overview-section">
          <article className="table-panel stack admin-detail-panel admin-period-table-panel">
            <div className="panel-header admin-period-table-header">
              <AllPeriodsTrigger open={showAllPeriods} section={selectedSection} periodTitle={periodTableTitle} />
              <div>
                <h2 className="section-title">{showAllPeriods ? "전체 출결표" : periodTableTitle}</h2>
                <div className="admin-period-legend">
                  <span className="admin-period-legend-item">
                    <span className="admin-period-legend-dot admin-period-legend-dot-done" />
                    완료
                  </span>
                  <span className="admin-period-legend-item">
                    <span className="admin-period-legend-dot admin-period-legend-dot-pending" />
                    미완료
                  </span>
                </div>
              </div>
              <AdminRefreshButton />
            </div>

            {showAllPeriods ? (
              <AllPeriodsExpanded rows={allPeriodsRows} isPreview={allPeriodsIsPreview} />
            ) : periodTableRows.length > 0 && periodTableLabels.length > 0 ? (
              <>
                {specialCaseGroups.length > 0 ? (
                  <div className="notice small admin-special-case-notice">
                    <div className="stack admin-special-case-stack">
                      <strong className="admin-special-case-title">오늘 특이사항 인원</strong>
                      <div className="stack admin-special-case-groups">
                        {specialCaseGroups.map((group) => (
                          <div key={group.reasonCode} className="admin-special-case-group">
                            <span className="badge admin-special-case-badge">{group.label}</span>
                            <span>{group.names.join(", ")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="table-head admin-period-table-head" style={{ gridTemplateColumns: currentPeriodGridTemplate }}>
                  <span>이름</span>
                  {periodTableLabels.map((label) => (
                    <span key={`head-${label}`}>{label}</span>
                  ))}
                </div>
                {periodTableRows.map((row) => (
                  <div
                    key={row.id}
                    className="table-row admin-period-table-row"
                    style={{ gridTemplateColumns: currentPeriodGridTemplate }}
                  >
                    <span data-label="이름">
                      {row.displayName}
                      {row.correctedByAdmin ? " (정정)" : ""}
                    </span>
                    {row.statuses.map((status) => {
                      const complete = Boolean(status.occurredAt);
                      return (
                        <span key={`${row.username}-${status.label}`} data-label={status.label}>
                          <span className={`status-pill ${complete ? "status-ready" : "status-pending"}`}>
                            {complete ? formatKoreaDateTime(status.occurredAt) : "미완료"}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                ))}
              </>
            ) : (
              <div className="notice small">현재는 별도로 확인할 시간대 출결표가 없습니다.</div>
            )}
          </article>
        </section>

        </>
      ) : null}

      {selectedSection === "users" ? (
        <section className="stack">
          <article className="glass-panel stack admin-management-panel">
            <AdminRosterSyncPanel enabled={runtime.dataSource === "supabase" && runtime.rosterSyncConfigured} />
            <AttendanceManagementPanel
              users={adminUsers}
              rosterEntries={dashboard.scheduledUsers}
              workDate={dashboard.dateKey}
            />
            <AdminAttendanceCorrectionPanel
              dateKey={dashboard.dateKey}
              rows={dashboard.rows}
              enabled={runtime.dataSource === "supabase"}
            />
          </article>
        </section>
      ) : null}

      {selectedSection === "accounts" ? (
        <section className="stack">
          <article className="glass-panel stack admin-management-panel">
            <AdminUserManagementPanel initialUsers={adminUsers} enabled={runtime.dataSource === "supabase"} />
          </article>
        </section>
      ) : null}

      {selectedSection === "system" ? (
        <section className="stack">
          <article className="glass-panel stack admin-management-panel">
            <div className="panel-header">
              <div>
                <h2 className="section-title">시스템 설정</h2>
                <p className="section-subtitle">지점, GPS 기준, 운영 설정을 점검하고 수정합니다.</p>
              </div>
            </div>
            <AdminSettingsPanel
              enabled={runtime.dataSource === "supabase"}
              initialSettings={dashboard.settings}
              initialZones={dashboard.zones}
            />
          </article>
        </section>
      ) : null}
    </main>
  );
}


