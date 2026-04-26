"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

export function AdminRosterSyncPanel({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(
    enabled ? null : "Google Sheet 환경 변수가 설정되지 않아 동기화를 사용할 수 없습니다.",
  );

  async function handleSync() {
    setPending(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/roster-sync", { method: "POST" });
      const data = (await res.json()) as { error?: string; message?: string; syncedCount?: number; skippedCount?: number };

      if (!res.ok) {
        setMessage(data.error ?? "동기화에 실패했습니다.");
        return;
      }

      setMessage(
        `동기화 완료 — ${data.syncedCount ?? 0}명 반영, ${data.skippedCount ?? 0}명 건너뜀`,
      );
      startTransition(() => router.refresh());
    } catch {
      setMessage("알 수 없는 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack">
      <div className="panel-header" style={{ alignItems: "center" }}>
        <h2 className="section-title">근무표 동기화</h2>
        <button
          type="button"
          className="button"
          style={{ whiteSpace: "nowrap" }}
          disabled={!enabled || pending}
          onClick={handleSync}
        >
          {pending ? "동기화 중..." : "지금 동기화"}
        </button>
      </div>
      {message ? <div className="notice">{message}</div> : null}
    </div>
  );
}
