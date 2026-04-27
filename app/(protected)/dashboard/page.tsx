import { redirect } from "next/navigation";

import { AttendanceActionPanel } from "@/components/attendance-action-panel";
import { getShiftLabel } from "@/lib/attendance-events";
import { getDevCoordinatesForTesting, getRuntimeInfo, getUserTodayView } from "@/lib/app-data";
import { requireSession } from "@/lib/auth";


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
    getUserTodayView(session.username, session),
    getDevCoordinatesForTesting(),
    getRuntimeInfo(),
  ]);
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

{runtime.setupMessage ? <div className="error-box">{runtime.setupMessage}</div> : null}

        <AttendanceActionPanel eventStates={view.eventStates} devCoordinates={devCoordinates} variant="quick" />
      </section>
    </main>
  );
}
