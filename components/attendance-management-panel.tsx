"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { AdminUserListItem, RosterEntry, RosterReasonCode, ShiftType } from "@/lib/types";

interface WorkTypeOption {
  label: string;
  isScheduled: boolean;
  shiftType: ShiftType;
  reasonCode: RosterReasonCode | null;
}

const WORK_TYPES: WorkTypeOption[] = [
  { label: "주간조", isScheduled: true, shiftType: "day", reasonCode: null },
  { label: "늦조", isScheduled: true, shiftType: "late", reasonCode: null },
  { label: "연차", isScheduled: false, shiftType: "day", reasonCode: "leave" },
  { label: "예비군", isScheduled: false, shiftType: "day", reasonCode: "military" },
  { label: "오후반차", isScheduled: false, shiftType: "day", reasonCode: "half_day_pm" },
  { label: "오전반차", isScheduled: false, shiftType: "day", reasonCode: "half_day_am" },
];

function currentWorkTypeLabel(entry: RosterEntry | undefined): string {
  if (!entry) return "미설정";
  if (!entry.isScheduled) {
    switch (entry.scheduleReasonCode) {
      case "leave": return "연차";
      case "military": return "예비군";
      case "half_day_am": return "오전반차";
      case "half_day_pm": return "오후반차";
      default: return "미근무";
    }
  }
  return entry.shiftType === "late" ? "늦조" : "주간조";
}

function workTypeStatusClass(entry: RosterEntry | undefined): string {
  if (!entry) return "status-pending";
  return entry.isScheduled ? "status-ready" : "status-pending";
}

export function AttendanceManagementPanel({
  users,
  rosterEntries,
  workDate,
}: {
  users: AdminUserListItem[];
  rosterEntries: RosterEntry[];
  workDate: string;
}) {
  const router = useRouter();
  const [openUsername, setOpenUsername] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  const entryMap = new Map(rosterEntries.map((e) => [e.username, e]));

  async function handleSelect(user: AdminUserListItem, option: WorkTypeOption) {
    setSaving(user.username);
    try {
      const res = await fetch("/api/admin/roster-entry", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workDate,
          username: user.username,
          displayName: user.displayName,
          isScheduled: option.isScheduled,
          shiftType: option.shiftType,
          reasonCode: option.reasonCode,
        }),
      });
      if (res.ok) {
        setOpenUsername(null);
        router.refresh();
      }
    } finally {
      setSaving(null);
    }
  }

  function getSortPriority(entry: RosterEntry | undefined): number {
    if (!entry) return 7;
    if (entry.isScheduled && entry.shiftType === "day") return 1;
    if (entry.isScheduled && entry.shiftType === "late") return 2;
    if (entry.scheduleReasonCode === "leave") return 3;
    if (entry.scheduleReasonCode === "military") return 4;
    if (entry.scheduleReasonCode === "half_day_pm") return 5;
    if (entry.scheduleReasonCode === "half_day_am") return 6;
    return 7;
  }

  const activeUsers = users
    .filter((u) => u.isActive)
    .filter((u) => u.displayName.includes(search.trim()))
    .sort((a, b) => {
      const pa = getSortPriority(entryMap.get(a.username));
      const pb = getSortPriority(entryMap.get(b.username));
      if (pa !== pb) return pa - pb;
      return a.displayName.localeCompare(b.displayName, "ko");
    });

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="panel-header" style={{ alignItems: "center", marginBottom: 0 }}>
        <span className="section-title" style={{ fontSize: "0.95rem", whiteSpace: "nowrap" }}>인원 명단</span>
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6 }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <span style={{ position: "absolute", left: 8, fontSize: "0.8rem", color: "var(--fg-muted)", pointerEvents: "none" }}>🔍</span>
            <input
              type="search"
              placeholder="이름 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 26, width: 110, fontSize: "0.82rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--line)", background: "rgba(255,255,255,0.7)", height: 30 }}
            />
          </div>
          <button
            type="button"
            className="button-subtle"
            style={{ padding: "4px 8px" }}
            onClick={() => setIsExpanded((v) => !v)}
          >
            {isExpanded ? "▲" : "▼"}
          </button>
        </div>
      </div>
    {isExpanded && (
    <div className="mgmt-user-list">
      {activeUsers.map((user) => {
        const entry = entryMap.get(user.username);
        const isOpen = openUsername === user.username;
        const isSaving = saving === user.username;
        const label = currentWorkTypeLabel(entry);
        const statusClass = workTypeStatusClass(entry);

        return (
          <div key={user.username} className={`mgmt-user-row${isOpen ? " mgmt-user-row-open" : ""}`}>
            <button
              className="mgmt-user-header"
              onClick={() => setOpenUsername(isOpen ? null : user.username)}
              disabled={isSaving}
            >
              <span className="mgmt-user-name">
                {isSaving ? "저장 중..." : user.displayName}
              </span>
              <span className={`status-pill ${statusClass}`}>{label}</span>
              <span className="mgmt-user-chevron">{isOpen ? "▲" : "▼"}</span>
            </button>

            {isOpen && (
              <div className="mgmt-user-options">
                {WORK_TYPES.map((option) => (
                  <button
                    key={option.label}
                    className={`mgmt-option-btn${label === option.label ? " mgmt-option-btn-active" : ""}`}
                    onClick={() => handleSelect(user, option)}
                    disabled={isSaving}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
    )}
    </div>
  );
}
