"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { RosterEntry, ShiftType } from "@/lib/types";

interface AdminRosterControlsPanelProps {
  dateKey: string;
  entries: RosterEntry[];
  enabled: boolean;
}

export function AdminRosterControlsPanel({ dateKey, entries, enabled }: AdminRosterControlsPanelProps) {
  const router = useRouter();
  const initialEntries = useMemo(() => entries.filter((entry) => entry.isScheduled), [entries]);
  const [rows, setRows] = useState(initialEntries);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(
    enabled ? null : "현재 저장소에서는 오늘 근무자 설정을 수정할 수 없습니다.",
  );

  function updateRow(username: string, patch: Partial<{ shiftType: ShiftType; allowLunchOut: boolean }>) {
    setRows((current) => current.map((row) => (row.username === username ? { ...row, ...patch } : row)));
  }

  async function handleSave() {
    setPending(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/roster-controls", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workDate: dateKey,
          entries: rows.map((row) => ({
            username: row.username,
            shiftType: row.shiftType,
            allowLunchOut: row.allowLunchOut,
          })),
        }),
      });

      const data = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        setMessage(data.error ?? "오늘 근무자 설정 저장에 실패했습니다.");
        return;
      }

      setMessage(data.message ?? "오늘 근무자 설정을 저장했습니다.");
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack">
      <div className="panel-header">
        <div>
          <h2 className="section-title">오늘 근무자 설정</h2>
          <p className="section-subtitle">근무 대상자 중 늦조 여부와 점심 출입 대상을 당일 기준으로 지정합니다.</p>
        </div>
      </div>

      {rows.length === 0 ? <div className="notice">오늘 근무 대상으로 잡힌 사용자가 아직 없습니다.</div> : null}

      <div className="zone-editor-list">
        {rows.map((row) => (
          <div key={row.username} className="zone-editor-card stack">
            <div className="zone-editor-header">
              <div className="inline-row">
                <strong>{row.displayName}</strong>
                <span className="badge">{row.username}</span>
              </div>
            </div>
            <div className="settings-grid">
              <div className="field">
                <label htmlFor={`shift-${row.username}`}>근무 조</label>
                <select
                  id={`shift-${row.username}`}
                  value={row.shiftType}
                  onChange={(event) => updateRow(row.username, { shiftType: event.target.value as ShiftType })}
                >
                  <option value="day">주간조</option>
                  <option value="late">늦조</option>
                </select>
              </div>
              <label className="checkbox-row" htmlFor={`lunch-${row.username}`}>
                <input
                  id={`lunch-${row.username}`}
                  type="checkbox"
                  checked={row.allowLunchOut}
                  onChange={(event) => updateRow(row.username, { allowLunchOut: event.target.checked })}
                />
                점심 출입 버튼 허용
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="inline-row">
        <button type="button" className="button" disabled={!enabled || pending || rows.length === 0} onClick={handleSave}>
          {pending ? "저장 중..." : "오늘 근무자 설정 저장"}
        </button>
      </div>
      {message ? <div className="notice">{message}</div> : null}
    </div>
  );
}
