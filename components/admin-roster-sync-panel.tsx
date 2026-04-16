"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

import type { DataSourceKind, RosterSyncPreview } from "@/lib/types";

interface AdminRosterSyncPanelProps {
  enabled: boolean;
  dataSource: DataSourceKind;
}

export function AdminRosterSyncPanel({ enabled, dataSource }: AdminRosterSyncPanelProps) {
  const router = useRouter();
  const [preview, setPreview] = useState<RosterSyncPreview | null>(null);
  const [pendingPreview, setPendingPreview] = useState(false);
  const [pendingSync, setPendingSync] = useState(false);
  const [message, setMessage] = useState<string | null>(
    enabled
      ? null
      : dataSource === "demo"
        ? "데모 모드에서는 근무표 동기화를 실행하지 않습니다."
        : "Google Sheet 환경 변수를 연결하면 근무표 동기화를 사용할 수 있습니다.",
  );

  async function handlePreview() {
    setPendingPreview(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/roster-sync", {
        method: "GET",
      });
      const data = (await response.json()) as RosterSyncPreview & { error?: string };

      if (!response.ok) {
        setMessage(data.error ?? "근무표 미리보기를 불러오지 못했습니다.");
        return;
      }

      setPreview(data);
      setMessage(`${data.sourceLabel} 기준으로 오늘 반영될 근무표를 불러왔습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setPendingPreview(false);
    }
  }

  async function handleSync() {
    setPendingSync(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/roster-sync", {
        method: "POST",
      });
      const data = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        setMessage(data.error ?? "근무표 동기화에 실패했습니다.");
        return;
      }

      setMessage(data.message ?? "근무표를 동기화했습니다.");
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setPendingSync(false);
    }
  }

  return (
    <div className="stack">
      <div className="panel-header">
        <div>
          <h2 className="section-title">근무표 동기화</h2>
          <p className="section-subtitle">Google Sheet에서 오늘 근무자를 확인하고 DB에 동기화합니다.</p>
        </div>
      </div>
      <div className="inline-row">
        <button type="button" className="button-subtle" disabled={!enabled || pendingPreview || pendingSync} onClick={handlePreview}>
          {pendingPreview ? "미리보기 불러오는 중..." : "오늘 근무표 미리보기"}
        </button>
        <button type="button" className="button" disabled={!enabled || pendingSync} onClick={handleSync}>
          {pendingSync ? "동기화 중..." : "오늘 근무표 동기화"}
        </button>
      </div>

      {preview ? (
        <div className="stack">
          <div className="record-list compact-list">
            <div className="record-item">
              <span>기준 날짜</span>
              <strong>{preview.workDate}</strong>
            </div>
            <div className="record-item">
              <span>시트 형식</span>
              <strong>{preview.sourceLabel}</strong>
            </div>
            <div className="record-item">
              <span>근무 대상</span>
              <strong>{preview.summary.scheduledCount}명</strong>
            </div>
            <div className="record-item">
              <span>주간조</span>
              <strong>{preview.summary.dayShiftCount}명</strong>
            </div>
            <div className="record-item">
              <span>늦조</span>
              <strong>{preview.summary.lateShiftCount}명</strong>
            </div>
            <div className="record-item">
              <span>비대상</span>
              <strong>{preview.summary.excludedCount}명</strong>
            </div>
            <div className="record-item">
              <span>점심 허용 유지</span>
              <strong>{preview.summary.lunchAllowedCount}명</strong>
            </div>
          </div>

          {preview.unmatchedNames.length > 0 ? (
            <div className="stack">
              <div className="notice small">앱 계정과 매칭되지 않은 시트 이름</div>
              <div className="name-chip-list">
                {preview.unmatchedNames.map((name) => (
                  <span key={name} className="badge">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="record-list compact-list">
            {preview.rows.map((row) => (
              <div key={row.username} className="record-item">
                <span>
                  {row.displayName}
                  {row.allowLunchOut ? " · 점심허용" : ""}
                  {!row.isScheduled && row.scheduleReason ? ` · ${row.scheduleReason}` : ""}
                </span>
                <strong>
                  {row.isScheduled ? row.shiftType === "late" ? "늦조" : "주간조" : "비대상"}
                </strong>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {message ? <div className="notice small">{message}</div> : null}
    </div>
  );
}
