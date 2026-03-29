import { redirect } from "next/navigation";

import { AttendanceActionPanel } from "@/components/attendance-action-panel";
import { getShiftLabel } from "@/lib/attendance-events";
import type { AttendanceEventState } from "@/lib/types";
import { getDevCoordinatesForTesting, getRuntimeInfo, getUserTodayView } from "@/lib/app-data";
import { requireSession } from "@/lib/auth";

function getPrimaryState(eventStates: AttendanceEventState[]) {
  return eventStates.find((state) => state.implemented && state.action && state.visible);
}

function getCompletedStates(eventStates: AttendanceEventState[]) {
  return eventStates.filter((state) => state.implemented && state.occurredAt);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string }>;
}) {
  const session = await requireSession();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const isAdminUserPreview = resolvedSearchParams?.view === "user";

  if (session.role === "admin" && !isAdminUserPreview) {
    redirect("/admin");
  }

  const [view, devCoordinates, runtime] = await Promise.all([
    getUserTodayView(session.username),
    getDevCoordinatesForTesting(),
    getRuntimeInfo(),
  ]);
  const primaryState = getPrimaryState(view.eventStates);
  const completedStates = getCompletedStates(view.eventStates);

  return (
    <main className="check-screen">
      <section className="check-card">
        <div className="check-card-head">
          <div>
            <h1 className="check-title">출석체크</h1>
            <div className="check-date">{view.dateLabel}</div>
          </div>
          <div className="check-chip-stack">
            <span className={`status-pill ${view.isScheduled ? "status-ready" : "status-locked"}`}>
              {view.isScheduled ? "오늘 근무" : "비근무"}
            </span>
            <span className="badge">{getShiftLabel(view.shiftType)}</span>
          </div>
        </div>

        <div className="record-item check-current-period-row">
          <span>현재 시간대</span>
          <strong>{view.currentPeriod.label}</strong>
        </div>
        <p className="section-subtitle check-current-period-copy">{view.currentPeriod.description}</p>

        <section className="check-focus-card check-focus-card-mobile-secondary">
          <div className="check-focus-header">
            <span className="brand-kicker">지금 할 일</span>
            {primaryState?.action ? (
              <span className={`status-pill ${primaryState.available ? "status-ready" : "status-pending"}`}>
                {primaryState.available ? "지금 가능" : "확인 필요"}
              </span>
            ) : null}
          </div>
          <strong className="check-focus-title">
            {primaryState?.label ?? (view.isScheduled ? "오늘 필요한 기록을 모두 마쳤습니다." : "오늘 근무 대상이 아닙니다.")}
          </strong>
          <p className="section-subtitle check-focus-copy">
            {primaryState?.reason ?? (view.isScheduled ? "현재 시간대에 추가로 처리할 기록이 없습니다." : "오늘 근무표 기준으로 출결 버튼이 열리지 않습니다.")}
          </p>
        </section>

        {runtime.setupMessage ? <div className="error-box">{runtime.setupMessage}</div> : null}

        <AttendanceActionPanel eventStates={view.eventStates} devCoordinates={devCoordinates} />

        <section className="check-summary-panel check-summary-panel-mobile-secondary">
          <div className="panel-header">
            <div>
              <h2 className="section-title">오늘 기록 요약</h2>
              <p className="section-subtitle">이미 처리한 기록은 아래에서 바로 확인할 수 있습니다.</p>
            </div>
          </div>
          {completedStates.length > 0 ? (
            <div className="record-list compact-list">
              {completedStates.map((state) => (
                <div key={`done-${state.code}`} className="record-item">
                  <span>{state.label}</span>
                  <strong>{state.occurredAt?.slice(11, 16) ?? "완료"}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="notice small">아직 완료된 기록이 없습니다.</div>
          )}
        </section>
      </section>
    </main>
  );
}
