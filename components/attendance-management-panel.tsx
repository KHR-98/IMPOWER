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
  if (!entry) return "";
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

  const activeUsers = users.filter((u) => u.isActive);

  return (
    <div className="attendance-mgmt-list">
      {activeUsers.map((user) => {
        const entry = entryMap.get(user.username);
        const isOpen = openUsername === user.username;
        const isSaving = saving === user.username;
        const currentLabel = currentWorkTypeLabel(entry);

        return (
          <div key={user.username} className="attendance-mgmt-row">
            <div className="attendance-mgmt-row-header">
              <button
                className={`attendance-mgmt-name-btn${isOpen ? " attendance-mgmt-name-btn-active" : ""}`}
                onClick={() => setOpenUsername(isOpen ? null : user.username)}
                disabled={isSaving}
              >
                {user.displayName}
              </button>
              {currentLabel && (
                <span className={`status-pill ${entry?.isScheduled ? "status-ready" : "status-pending"}`}>
                  {currentLabel}
                </span>
              )}
            </div>

            {isOpen && (
              <div className="attendance-mgmt-options">
                {WORK_TYPES.map((option) => (
                  <button
                    key={option.label}
                    className="attendance-mgmt-option-btn"
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
  );
}
