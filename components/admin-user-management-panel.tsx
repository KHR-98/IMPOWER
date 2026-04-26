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
  const [openUsername, setOpenUsername] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>("user");
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(
    enabled ? null : "현재 저장소에서는 사용자 계정을 수정할 수 없습니다.",
  );

  const openUser = openUsername ? (initialUsers.find((u) => u.username === openUsername) ?? null) : null;

  useEffect(() => {
    if (openUser) setRole(openUser.role);
  }, [openUser]);

  async function handleSave(user: AdminUserListItem) {
    setSaving(user.username);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "update",
          username: user.username,
          displayName: user.displayName,
          role,
          isActive: user.isActive,
          password: null,
        }),
      });
      const data = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        setMessage(data.error ?? "저장에 실패했습니다.");
        return;
      }

      setMessage(data.message ?? "권한을 저장했습니다.");
      setOpenUsername(null);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setSaving(null);
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
        <div className="user-mgmt-grid">
          {initialUsers.map((user) => {
            const isOpen = openUsername === user.username;
            const isSaving = saving === user.username;

            return (
              <div key={user.id} className={`mgmt-user-row${isOpen ? " mgmt-user-row-open" : ""}`}>
                <button
                  className="mgmt-user-header"
                  onClick={() => setOpenUsername(isOpen ? null : user.username)}
                  disabled={isSaving}
                >
                  <span className="mgmt-user-name">{isSaving ? "저장 중..." : user.displayName}</span>
                  <span className="badge">{user.role === "admin" ? "관리자" : "일반"}</span>
                  <span className="mgmt-user-chevron">{isOpen ? "▲" : "▼"}</span>
                </button>

                {isOpen && (
                  <div className="mgmt-user-options">
                    <select
                      value={role}
                      disabled={!enabled || isSaving}
                      onChange={(e) => setRole(e.target.value as UserRole)}
                    >
                      <option value="user">일반 사용자</option>
                      <option value="admin">관리자</option>
                    </select>
                    <button
                      type="button"
                      className="mgmt-option-btn"
                      disabled={!enabled || isSaving}
                      onClick={() => handleSave(user)}
                    >
                      저장
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="notice small">등록된 계정이 없습니다.</div>
      )}

      {message ? <div className="notice">{message}</div> : null}
    </div>
  );
}
