import { redirect } from "next/navigation";

import { AttendanceActionPanel } from "@/components/attendance-action-panel";
import { CheckDateStatusRow } from "@/components/check-date-status-row";
import { UserLocationMap } from "@/components/user-location-map";
import { getShiftLabel } from "@/lib/attendance-events";
import { getDevCoordinatesForTesting, getRuntimeInfo, getSettings, getUserTodayView, getZones } from "@/lib/app-data";
import { requireSession } from "@/lib/auth";
import { hasCurrentConsent } from "@/lib/consent-store";


export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string }>;
}) {
  const session = await requireSession();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const isAdminUserPreview = resolvedSearchParams?.view === "user";

  // viewer(열람 전용)는 사용자(워커) 화면이 없다 — 항상 관리자 열람 화면으로 보낸다.
  if (session.role === "viewer") {
    redirect("/admin");
  }

  if ((session.role === "admin" || session.role === "sub_admin") && !isAdminUserPreview) {
    redirect("/admin");
  }

  if (!(await hasCurrentConsent(session.username))) {
    redirect(`/consent?next=${encodeURIComponent(isAdminUserPreview ? "/dashboard?view=user" : "/dashboard")}`);
  }

  const [view, devCoordinates, runtime, zones, settings] = await Promise.all([
    getUserTodayView(session.username, session),
    getDevCoordinatesForTesting(),
    getRuntimeInfo(),
    getZones(),
    getSettings(),
  ]);
  return (
    <main className="check-screen">
      <section className="check-card">
        <div className="check-card-head">
          <div>
            <h1 className="check-title">출석체크</h1>
            <CheckDateStatusRow dateLabel={view.dateLabel} initialEventStates={view.eventStates} />
          </div>
          <div className="check-chip-stack">
            <span className={`status-pill ${view.isScheduled ? "status-ready" : "status-locked"}`}>
              {view.isScheduled ? "오늘 근무" : "비근무"}
            </span>
            <span className="badge">{getShiftLabel(view.shiftType)}</span>
          </div>
        </div>

{runtime.setupMessage ? <div className="error-box">{runtime.setupMessage}</div> : null}

        <AttendanceActionPanel
          eventStates={view.eventStates}
          devCoordinates={devCoordinates}
          zones={zones}
          maxGpsAccuracyM={settings.maxGpsAccuracyM}
          variant="quick"
        />
        <UserLocationMap zones={zones} />
      </section>
    </main>
  );
}
