"use client";

import { useState } from "react";

export function AdminHolidaySyncPanel() {
  const [pending, setPending] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSync(year: number) {
    setPending(year);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/sync-holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year }),
      });
      const data = (await res.json()) as { error?: string; synced?: number };

      if (!res.ok) {
        setMessage(data.error ?? "동기화에 실패했습니다.");
        return;
      }

      setMessage(`${year}년 공휴일 동기화 완료 — ${data.synced ?? 0}개 반영`);
    } catch {
      setMessage("알 수 없는 오류가 발생했습니다.");
    } finally {
      setPending(null);
    }
  }

  const currentYear = new Date().getFullYear();

  return (
    <div className="stack">
      <div className="panel-header" style={{ alignItems: "center" }}>
        <div>
          <h2 className="section-title">공휴일 동기화</h2>
          <p className="section-subtitle">Google 캘린더에서 한국 공휴일을 불러옵니다.</p>
        </div>
        <div className="inline-row" style={{ gap: "0.5rem" }}>
          <button
            type="button"
            className="button-subtle"
            disabled={pending !== null}
            onClick={() => handleSync(currentYear)}
          >
            {pending === currentYear ? "동기화 중..." : `${currentYear}년`}
          </button>
          <button
            type="button"
            className="button-subtle"
            disabled={pending !== null}
            onClick={() => handleSync(currentYear + 1)}
          >
            {pending === currentYear + 1 ? "동기화 중..." : `${currentYear + 1}년`}
          </button>
        </div>
      </div>
      {message ? <div className="notice">{message}</div> : null}
    </div>
  );
}
