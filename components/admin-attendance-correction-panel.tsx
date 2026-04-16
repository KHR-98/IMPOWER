"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { AttendanceRecord } from "@/lib/types";

interface AdminAttendanceCorrectionPanelProps {
  dateKey: string;
  rows: AttendanceRecord[];
  enabled: boolean;
}

function toInputValue(value: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function toIsoValue(value: string): string | null {
  if (!value) {
    return null;
  }

  return new Date(value).toISOString();
}

export function AdminAttendanceCorrectionPanel({ dateKey, rows, enabled }: AdminAttendanceCorrectionPanelProps) {
  const router = useRouter();
  const [selectedUsername, setSelectedUsername] = useState(rows[0]?.username ?? "");
  const [checkInAt, setCheckInAt] = useState("");
  const [tbmAt, setTbmAt] = useState("");
  const [checkOutAt, setCheckOutAt] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(
    enabled ? null : "현재 저장소에서는 기록 정정 기능을 사용할 수 없습니다.",
  );

  const selectedRow = rows.find((row) => row.username === selectedUsername) ?? rows[0] ?? null;

  useEffect(() => {
    if (!selectedRow) {
      setCheckInAt("");
      setTbmAt("");
      setCheckOutAt("");
      return;
    }

    setCheckInAt(toInputValue(selectedRow.checkIn?.occurredAt ?? null));
    setTbmAt(toInputValue(selectedRow.tbm?.occurredAt ?? null));
    setCheckOutAt(toInputValue(selectedRow.checkOut?.occurredAt ?? null));
    setReason(selectedRow.correctionNote ?? "");
  }, [selectedRow]);

  async function handleSave() {
    if (!selectedRow) {
      setMessage("정정할 사용자를 찾을 수 없습니다.");
      return;
    }

    setPending(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/attendance-correction", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workDate: dateKey,
          username: selectedRow.username,
          expectedUpdatedAt: selectedRow.updatedAt,
          checkInAt: toIsoValue(checkInAt),
          tbmAt: toIsoValue(tbmAt),
          checkOutAt: toIsoValue(checkOutAt),
          reason,
        }),
      });
      const data = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        setMessage(data.error ?? "기록 정정에 실패했습니다.");
        return;
      }

      setMessage(data.message ?? "기록 정정을 저장했습니다.");
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack correction-panel">
      <div className="panel-header">
        <div>
          <h2 className="section-title">기록 정정</h2>
          <p className="section-subtitle">관리자 권한으로 오늘 출결 시간을 직접 수정하고 사유를 기록합니다.</p>
        </div>
      </div>

      <div className="field">
        <label htmlFor="correction-user">대상 사용자</label>
        <select id="correction-user" value={selectedUsername} onChange={(event) => setSelectedUsername(event.target.value)}>
          {rows.map((row) => (
            <option key={row.username} value={row.username}>
              {row.displayName}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-grid">
        <div className="field">
          <label htmlFor="correction-check-in">출근 시간</label>
          <input id="correction-check-in" type="datetime-local" value={checkInAt} onChange={(event) => setCheckInAt(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="correction-tbm">TBM 시간</label>
          <input id="correction-tbm" type="datetime-local" value={tbmAt} onChange={(event) => setTbmAt(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="correction-check-out">퇴근 시간</label>
          <input id="correction-check-out" type="datetime-local" value={checkOutAt} onChange={(event) => setCheckOutAt(event.target.value)} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="correction-reason">정정 사유</label>
        <textarea
          id="correction-reason"
          rows={3}
          placeholder="예: GPS 오차로 출근 버튼이 동작하지 않아 관리자 정정"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>

      <div className="notice small">시간을 비우면 해당 기록이 삭제됩니다. 변경 내용은 매번 감사 로그에 기록됩니다.</div>

      <div className="inline-row">
        <button type="button" className="button" disabled={!enabled || pending || !selectedRow} onClick={handleSave}>
          {pending ? "정정 저장 중..." : "기록 정정 저장"}
        </button>
        {selectedRow?.correctedByAdmin ? <span className="status-pill status-pending">최근 관리자 정정 있음</span> : null}
      </div>

      {message ? <div className="notice">{message}</div> : null}
    </div>
  );
}

