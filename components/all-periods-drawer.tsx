"use client";

import { useState } from "react";

export interface AllPeriodsRow {
  username: string;
  displayName: string;
  shiftType: "day" | "late";
  items: { label: string; done: boolean }[];
}

const DAY_COLUMNS = ["출근", "오전 TBM", "오후 TBM", "퇴근 TBM", "퇴근"];
const LATE_COLUMNS = ["출근", "퇴근"];

export function AllPeriodsDrawer({ rows }: { rows: AllPeriodsRow[] }) {
  const [open, setOpen] = useState(false);

  const dayRows = rows.filter((r) => r.shiftType === "day");
  const lateRows = rows.filter((r) => r.shiftType === "late");

  return (
    <div className="all-periods-trigger-wrap">
      <button
        type="button"
        className="button-subtle all-periods-trigger"
        onClick={() => setOpen(true)}
      >
        전체 현황
      </button>

      {open && (
        <div
          className="all-periods-overlay"
          onClick={() => setOpen(false)}
        />
      )}

      <div className={`all-periods-drawer${open ? " all-periods-drawer-open" : ""}`}>
        <div className="all-periods-drawer-header">
          <h3 className="all-periods-drawer-title">전체 시간대 출결현황</h3>
          <button
            type="button"
            className="button-subtle all-periods-close"
            onClick={() => setOpen(false)}
          >
            닫기
          </button>
        </div>
        <div className="all-periods-drawer-body">
          <AllPeriodsGroup label="주간조" rows={dayRows} columns={DAY_COLUMNS} />
          <AllPeriodsGroup label="늦조" rows={lateRows} columns={LATE_COLUMNS} />
        </div>
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

  const gridTemplate = `1.4fr repeat(${columns.length}, 1fr)`;

  return (
    <div className="all-periods-group">
      <div className="all-periods-group-label">
        {label} ({rows.length}명)
      </div>
      <div className="all-periods-table-head" style={{ gridTemplateColumns: gridTemplate }}>
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
              {item.done ? "완료" : "미완"}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
