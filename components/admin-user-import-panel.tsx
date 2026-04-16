"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { SheetUserImportPreview } from "@/lib/types";

interface AdminUserImportPanelProps {
  enabled: boolean;
}

export function AdminUserImportPanel({ enabled }: AdminUserImportPanelProps) {
  const router = useRouter();
  const [preview, setPreview] = useState<SheetUserImportPreview | null>(null);
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [pendingPreview, setPendingPreview] = useState(false);
  const [pendingImport, setPendingImport] = useState(false);
  const [message, setMessage] = useState<string | null>(
    enabled ? null : "Google Sheet 연동 후 시트 이름으로 계정을 일괄 생성할 수 있습니다.",
  );

  useEffect(() => {
    setSelectedNames(preview?.missingNames ?? []);
  }, [preview]);

  async function handleLoadPreview() {
    setPendingPreview(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/users/import", {
        method: "GET",
      });
      const data = (await response.json()) as SheetUserImportPreview & { error?: string };

      if (!response.ok) {
        setMessage(data.error ?? "시트 사용자 미리보기를 불러오지 못했습니다.");
        return;
      }

      setPreview(data);
      setMessage(`${data.sourceLabel}에서 사용자 후보 ${data.totalSheetNames}명을 읽었습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setPendingPreview(false);
    }
  }

  function toggleName(name: string) {
    setSelectedNames((current) =>
      current.includes(name) ? current.filter((value) => value !== name) : [...current, name].sort((a, b) => a.localeCompare(b, "ko")),
    );
  }

  function selectAll() {
    setSelectedNames(preview?.missingNames ?? []);
  }

  function clearAll() {
    setSelectedNames([]);
  }

  async function handleImport() {
    setPendingImport(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/users/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          password,
          selectedNames,
        }),
      });
      const data = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        setMessage(data.error ?? "시트 사용자 일괄 생성에 실패했습니다.");
        return;
      }

      setPassword("");
      setMessage(data.message ?? "시트 사용자 계정을 생성했습니다.");
      startTransition(() => router.refresh());
      void handleLoadPreview();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setPendingImport(false);
    }
  }

  const selectedCount = selectedNames.length;

  return (
    <div className="stack">
      <div className="panel-header">
        <div>
          <h2 className="section-title">시트 사용자 가져오기</h2>
          <p className="section-subtitle">시트에서 이름 목록을 읽어 필요한 인원만 선택해 일괄 생성합니다.</p>
        </div>
      </div>

      <div className="inline-row">
        <button type="button" className="button-subtle" disabled={!enabled || pendingPreview || pendingImport} onClick={handleLoadPreview}>
          {pendingPreview ? "불러오는 중..." : "시트 사용자 미리보기"}
        </button>
      </div>

      {preview ? (
        <div className="stack">
          <div className="record-list compact-list">
            <div className="record-item">
              <span>시트 형식</span>
              <strong>{preview.sourceLabel}</strong>
            </div>
            <div className="record-item">
              <span>시트 사용자 후보</span>
              <strong>{preview.totalSheetNames}명</strong>
            </div>
            <div className="record-item">
              <span>이미 계정이 있는 이름</span>
              <strong>{preview.matchedCount}명</strong>
            </div>
            <div className="record-item">
              <span>새로 생성 가능한 이름</span>
              <strong>{preview.missingNames.length}명</strong>
            </div>
            <div className="record-item">
              <span>현재 선택한 이름</span>
              <strong>{selectedCount}명</strong>
            </div>
          </div>

          {preview.missingNames.length > 0 ? (
            <>
              <div className="inline-row">
                <button type="button" className="button-subtle" disabled={pendingImport} onClick={selectAll}>
                  전체 선택
                </button>
                <button type="button" className="button-subtle" disabled={pendingImport} onClick={clearAll}>
                  전체 해제
                </button>
              </div>

              <div className="name-chip-list">
                {preview.missingNames.map((name) => {
                  const selected = selectedNames.includes(name);

                  return (
                    <button
                      key={name}
                      type="button"
                      className={`name-chip-button${selected ? " name-chip-button-selected" : ""}`}
                      disabled={pendingImport}
                      onClick={() => toggleName(name)}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>

              <div className="settings-grid">
                <div className="field">
                  <label htmlFor="sheet-import-password">공통 초기 비밀번호</label>
                  <input
                    id="sheet-import-password"
                    type="password"
                    value={password}
                    placeholder="예: 1234"
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
              </div>

              <div className="notice small">
                이름을 눌러 생성 대상을 선택하세요. 로그인 ID와 표시 이름은 시트 이름 그대로 사용됩니다.
              </div>

              <div className="inline-row">
                <button
                  type="button"
                  className="button"
                  disabled={!enabled || pendingImport || password.trim().length < 4 || selectedCount === 0}
                  onClick={handleImport}
                >
                  {pendingImport ? "생성 중..." : `${selectedCount}명 선택 생성`}
                </button>
              </div>
            </>
          ) : (
            <div className="notice small">지금은 시트 기준으로 새로 만들 계정이 없습니다.</div>
          )}
        </div>
      ) : null}

      {message ? <div className="notice small">{message}</div> : null}
    </div>
  );
}
