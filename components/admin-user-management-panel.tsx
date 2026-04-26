"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { AdminUserListItem, UserRole } from "@/lib/types";

interface AdminUserManagementPanelProps {
  initialUsers: AdminUserListItem[];
  enabled: boolean;
}

export function AdminUserManagementPanel({ initialUsers, enabled }: AdminUserManagementPanelProps) {
  const router = useRouter();
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>("user");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(
    enabled ? null : "현재 저장소에서는 사용자 계정을 수정할 수 없습니다.",
  );

  const selectedUser = selectedUsername ? (initialUsers.find((user) => user.username === selectedUsername) ?? null) : null;

  useEffect(() => {
    if (selectedUser) {
      setRole(selectedUser.role);
    }
  }, [selectedUser]);

  async function handleSave() {
    if (!selectedUser) return;
    setPending(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "update",
          username: selectedUser.username,
          displayName: selectedUser.displayName,
          role,
          isActive: selectedUser.isActive,
          password: null,
        }),
      });
      const data = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        setMessage(data.error ?? "저장에 실패했습니다.");
        return;
      }

      setMessage(data.message ?? "권한을 저장했습니다.");
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
          <h2 className="section-title">사용자 관리</h2>
          <p className="section-subtitle">사용자 권한을 관리합니다.</p>
        </div>
      </div>

      {initialUsers.length ? (
        <div className="zone-editor-list user-mgmt-grid">
          {initialUsers.map((user) => {
            const selected = user.username === selectedUsername;

            return (
              <div key={user.id} className={`zone-editor-card stack${selected ? " user-card-selected" : ""}`} style={{ gap: 10 }}>
                <strong>{user.displayName}</strong>
                <span className="badge" style={{ alignSelf: "flex-start" }}>{user.role === "admin" ? "관리자" : "일반"}</span>
                <button type="button" className="button-subtle" onClick={() => setSelectedUsername(selected ? null : user.username)}>
                  {selected ? "선택 중" : "선택"}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="notice small">등록된 계정이 없습니다.</div>
      )}

      {selectedUser ? (
        <>
          <div className="field">
            <label htmlFor="admin-user-role">{selectedUser.displayName} 권한</label>
            <select id="admin-user-role" value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
              <option value="user">일반 사용자</option>
              <option value="admin">관리자</option>
            </select>
          </div>

          <div className="inline-row">
            <button type="button" className="button" disabled={!enabled || pending} onClick={handleSave}>
              {pending ? "저장 중..." : "권한 저장"}
            </button>
          </div>
        </>
      ) : null}

      {message ? <div className="notice">{message}</div> : null}
    </div>
  );
}
