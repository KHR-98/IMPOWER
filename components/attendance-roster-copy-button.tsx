"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

export function AttendanceRosterCopyButton() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  const handleCopy = async () => {
    try {
      // 관리자 화면에서 선택한 부서 탭(URL의 departmentId)을 그대로 사용. 없으면 서버가 첫 활성 부서로 폴백.
      const departmentId = searchParams.get("departmentId");
      const query = departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : "";
      const response = await fetch(`/api/admin/roster-copy${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`명단 조회 실패 (${response.status})`);
      const text = await response.text();

      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // clipboard API가 막힌 환경(비-HTTPS 등)에서는 수동 복사할 수 있도록 프롬프트로 대체.
        window.prompt("아래 내용을 복사하세요.", text);
      }
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      window.setTimeout(() => setStatus("idle"), 2000);
    }
  };

  return (
    <button type="button" className="button topbar-roster-copy-btn" onClick={handleCopy}>
      {status === "copied" ? "복사됨" : status === "error" ? "복사 실패" : "출결 명단복사"}
    </button>
  );
}
