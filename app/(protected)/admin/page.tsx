import Link from "next/link";

import { AttendanceActionPanel } from "@/components/attendance-action-panel";
import { AdminAttendanceCorrectionPanel } from "@/components/admin-attendance-correction-panel";
import { AdminRefreshButton } from "@/components/admin-refresh-button";
import { AdminRosterControlsPanel } from "@/components/admin-roster-controls-panel";
import { AdminSettingsPanel } from "@/components/admin-settings-panel";
import { AdminUserImportPanel } from "@/components/admin-user-import-panel";
import { AdminUserManagementPanel } from "@/components/admin-user-management-panel";
import { getAdminUserList, getDashboardView, getDevCoordinatesForTesting, getRuntimeInfo, getUserTodayView } from "@/lib/app-data";
import { requireAdmin } from "@/lib/auth";
import { buildCurrentPeriodOperatorRows } from "@/lib/current-period";
import { formatKoreaDateTime, getKoreaDateSlashLabel } from "@/lib/time";
import type { RosterReasonCode } from "@/lib/types";

type AdminSectionKey = "overview" | "users" | "operations" | "accounts" | "system";

const ADMIN_SECTION_OPTIONS: Array<{ key: AdminSectionKey; label: string }> = [
  { key: "overview", label: "오늘 현황" },
  { key: "users", label: "사용자 보기" },
  { key: "operations", label: "운영 관리" },
  { key: "accounts", label: "계정 관리" },
  { key: "system", label: "시스템 설정" },
];

function normalizeAdminSection(section: string | undefined): AdminSectionKey {
  if (section === "users" || section === "operations" || section === "accounts" || section === "system") {
    return section;
  }

  return "overview";
}

function buildPreviewRows(input: {
  rows: Awaited<ReturnType<typeof getDashboardView>>["rows"];
  scheduledUsers: Awaited<ReturnType<typeof getDashboardView>>["scheduledUsers"];
}) {
  const rowMap = new Map(input.rows.map((row) => [row.username, row]));
  const scheduledPreviewRows = input.scheduledUsers.slice(0, 6).map((entry) => {
    const row = rowMap.get(entry.username);

    return {
      id: row?.id ?? `preview-${entry.username}`,
      username: entry.username,
      displayName: entry.displayName,
      shiftLabel: entry.shiftType === "late" ? "늦조" : "주간조",
      correctedByAdmin: Boolean(row?.correctedByAdmin),
      statuses: [
        { label: "출근", occurredAt: row?.checkIn?.occurredAt ?? null },
        { label: "오전 TBM", occurredAt: row?.tbmMorning?.occurredAt ?? row?.tbm?.occurredAt ?? null },
        { label: "퇴근", occurredAt: row?.checkOut?.occurredAt ?? null },
      ],
    };
  });

  if (scheduledPreviewRows.length > 0) {
    return {
      labels: ["출근", "오전 TBM", "퇴근"],
      rows: scheduledPreviewRows,
      mode: "live-preview" as const,
    };
  }

  return {
    labels: ["출근", "오전 TBM", "퇴근"],
    rows: [
      {
        id: "example-day-1",
        username: "kim",
        displayName: "김현장",
        shiftLabel: "주간조",
        correctedByAdmin: false,
        statuses: [
          { label: "출근", occurredAt: "2026-03-25T06:54:00+09:00" },
          { label: "오전 TBM", occurredAt: null },
          { label: "퇴근", occurredAt: null },
        ],
      },
      {
        id: "example-day-2",
        username: "park",
        displayName: "박작업",
        shiftLabel: "주간조",
        correctedByAdmin: true,
        statuses: [
          { label: "출근", occurredAt: "2026-03-25T07:12:00+09:00" },
          { label: "오전 TBM", occurredAt: "2026-03-25T08:02:00+09:00" },
          { label: "퇴근", occurredAt: null },
        ],
      },
      {
        id: "example-late-1",
        username: "lee",
        displayName: "이늦조",
        shiftLabel: "늦조",
        correctedByAdmin: false,
        statuses: [
          { label: "출근", occurredAt: null },
          { label: "오전 TBM", occurredAt: null },
          { label: "퇴근", occurredAt: null },
        ],
      },
    ],
    mode: "example" as const,
  };
}

const SPECIAL_CASE_ORDER: RosterReasonCode[] = ["leave", "half_day_am", "half_day_pm", "half_day", "military", "blocked", "holiday"];
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
  searchParams?: Promise<{ section?: string; focus?: string }>;
}) {
  const session = await requireAdmin();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const selectedSection = normalizeAdminSection(resolvedSearchParams?.section);
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
  const previewTable = buildPreviewRows({
    rows: dashboard.rows,
    scheduledUsers: dashboard.scheduledUsers,
  });
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
  const periodTableLabels = currentPeriodRows.length > 0 ? currentPeriodLabels : previewTable.labels;
  const periodTableRows = currentPeriodRows.length > 0 ? currentPeriodRows : previewTable.rows;
  const currentPeriodGridTemplate = `1.15fr repeat(${Math.max(periodTableLabels.length, 1)}, minmax(0, 1fr))`;

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
            <h1>{getKoreaDateSlashLabel()} 출결현황</h1>
          </div>
          <div className="admin-hero-meta">
            <div className="admin-hero-stat">
              <span className="caption">현재 시간대</span>
              <strong>{dashboard.currentPeriod.label}</strong>
            </div>
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
              <div>
                <h2 className="section-title">현재 시간대 출결표</h2>
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

            {periodTableRows.length > 0 && periodTableLabels.length > 0 ? (
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

          {adminTodayView ? (
            <section className="glass-panel admin-overview-action-panel stack">
              <div className="panel-header">
                <div>
                  <h2 className="section-title">출결 버튼</h2>
                </div>
              </div>
              <AttendanceActionPanel eventStates={adminTodayView.eventStates} devCoordinates={devCoordinates} variant="quick" />
            </section>
          ) : null}
        </>
      ) : null}

      {selectedSection === "users" ? (
        <section className="stack">
          <article className="table-panel stack admin-detail-panel">
            <div className="panel-header">
              <div>
                <h2 className="section-title">전체 사용자별 상태</h2>
                <p className="section-subtitle">전체 출결 기록과 정정 여부를 확인합니다.</p>
              </div>
            </div>
            <div className="table-head admin-status-table-head">
              <span>이름</span>
              <span>조</span>
              <span>근무 대상</span>
              <span>출근</span>
              <span>오전 TBM</span>
              <span>점심 등록</span>
              <span>퇴근</span>
            </div>
            <div className="admin-status-table-body">
            {dashboard.rows.map((row) => {
              const scheduledEntry = dashboard.scheduledUsers.find((entry) => entry.username === row.username);
              return (
                <div key={row.id} className="table-row admin-status-table-row">
                  <span data-label="이름">{row.displayName}{row.correctedByAdmin ? " (정정)" : ""}</span>
                  <span data-label="조">{scheduledEntry?.shiftType === "late" ? "늦조" : "주간조"}</span>
                  <span data-label="근무 대상">{scheduledEntry?.isScheduled ? "대상" : "비대상"}</span>
                  <span data-label="출근">{formatKoreaDateTime(row.checkIn?.occurredAt ?? null)}</span>
                  <span data-label="오전 TBM">{formatKoreaDateTime(row.tbmMorning?.occurredAt ?? row.tbm?.occurredAt ?? null)}</span>
                  <span data-label="점심 등록">{formatKoreaDateTime(row.lunchRegister?.occurredAt ?? null)}</span>
                  <span data-label="퇴근">{formatKoreaDateTime(row.checkOut?.occurredAt ?? null)}</span>
                </div>
              );
            })}
            </div>
          </article>
        </section>
      ) : null}

      {selectedSection === "operations" ? (
        <section className="stack">
          <article className="glass-panel stack admin-management-panel">
            <div className="panel-header">
              <div>
                <h2 className="section-title">운영 관리</h2>
                <p className="section-subtitle">당일 출결 운영을 관리합니다.</p>
              </div>
            </div>
            <AdminRosterControlsPanel
              dateKey={dashboard.dateKey}
              entries={dashboard.scheduledUsers}
              enabled={runtime.dataSource === "supabase"}
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
            <div className="panel-header">
              <div>
                <h2 className="section-title">계정 관리</h2>
                <p className="section-subtitle">시트 계정 일괄 생성 및 사용자 권한·비밀번호를 관리합니다.</p>
              </div>
            </div>
            <AdminUserImportPanel enabled={runtime.dataSource === "supabase" && runtime.rosterSyncConfigured} />
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


