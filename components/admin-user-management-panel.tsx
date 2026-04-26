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
  const [search, setSearch] = useState("");
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

  const filteredUsers = initialUsers.filter((u) => u.displayName.includes(search.trim()));

  return (
    <div className="stack">
      <div className="panel-header" style={{ alignItems: "center" }}>
        <h2 className="section-title">사용자 권한 관리</h2>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <span style={{ position: "absolute", left: 8, fontSize: "0.8rem", color: "var(--fg-muted)", pointerEvents: "none" }}>🔍</span>
          <input
            type="search"
            placeholder="이름 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 26, width: 110, fontSize: "0.82rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--line)", background: "rgba(255,255,255,0.7)", height: 30 }}
          />
        </div>
      </div>

      {initialUsers.length ? (
        <div className="mgmt-user-list">
          {filteredUsers.map((user) => {
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
                  <div className="mgmt-user-options" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px" }}>
                    <select
                      value={role}
                      disabled={!enabled || isSaving}
                      onChange={(e) => setRole(e.target.value as UserRole)}
                      style={{ flex: 1, fontSize: "0.9rem", padding: "6px 8px" }}
                    >
                      <option value="user">일반 사용자</option>
                      <option value="admin">관리자</option>
                    </select>
                    <button
                      type="button"
                      className="button-subtle"
                      disabled={!enabled || isSaving}
                      onClick={() => handleSave(user)}
                      style={{ whiteSpace: "nowrap" }}
                    >
                      {isSaving ? "저장 중..." : "저장"}
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
