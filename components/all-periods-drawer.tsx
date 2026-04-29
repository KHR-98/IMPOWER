import Link from "next/link";

import { formatKoreaDateTime } from "@/lib/time";

export interface AllPeriodsRow {
  username: string;
  displayName: string;
  shiftType: "day" | "late";
  items: { label: string; done: boolean; occurredAt: string | null }[];
}

const DAY_COLUMNS = ["출근", "오전 TBM", "오후 TBM", "퇴근 TBM", "퇴근"];
const LATE_COLUMNS = ["출근", "퇴근"];

export function AllPeriodsTrigger({
  open,
  section,
  periodTitle,
}: {
  open: boolean;
  section: string;
  periodTitle: string;
}) {
  const href = open ? `?section=${section}` : `?section=${section}&allPeriods=1`;

  return (
    <Link
      href={href}
      className={`button all-periods-trigger all-periods-trigger-wrap${open ? " all-periods-trigger-active" : ""}`}
      scroll={false}
    >
      {open ? periodTitle : "전체 출결표"}
    </Link>
  );
}

export function AllPeriodsExpanded({ rows, isPreview }: { rows: AllPeriodsRow[]; isPreview?: boolean }) {
  const dayRows = rows.filter((r) => r.shiftType === "day");
  const lateRows = rows.filter((r) => r.shiftType === "late");

  return (
    <div className="all-periods-expanded">
      {isPreview && (
        <div className="notice small all-periods-preview-notice">
          명단이 확정되지 않아 예시 데이터를 표시합니다.
        </div>
      )}
      <div className="all-periods-expanded-body">
        <AllPeriodsGroup label="주간조" rows={dayRows} columns={DAY_COLUMNS} />
        <AllPeriodsGroup label="늦조" rows={lateRows} columns={LATE_COLUMNS} />
      </div>
    </div>
  );
}

function AllPeriodsGroup({
  label,
  rows,
  columns,
}: {
  label: string;
  rows: AllPeriodsRow[];
  columns: string[];
}) {
  if (rows.length === 0) return null;

  const gridTemplate = `1fr repeat(${columns.length}, 1.1fr)`;

  return (
    <div className="all-periods-group">
      <div className="all-periods-group-label">
        {label} ({rows.length}명)
      </div>
      <div
        className="all-periods-table-head"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        <span>이름</span>
        {columns.map((col) => (
          <span key={col}>{col}</span>
        ))}
      </div>
      {rows.map((row) => (
        <div
          key={row.username}
          className="all-periods-table-row"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <span className="all-periods-name">{row.displayName}</span>
          {row.items.map((item) => (
            <span
              key={item.label}
              className={`status-pill ${item.done ? "status-ready" : "status-pending"}`}
            >
              {item.done ? formatKoreaDateTime(item.occurredAt) : "미완료"}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
