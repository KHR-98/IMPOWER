"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getRoleLabel } from "@/lib/permissions";
import type { AdminUserListItem, Department, UserRole } from "@/lib/types";

const ROLE_ORDER: Record<string, number> = { master: 0, admin: 1, sub_admin: 2, user: 3 };

function sortUsers(users: AdminUserListItem[]): AdminUserListItem[] {
  return [...users].sort((a, b) => {
    const roleDiff = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99);
    if (roleDiff !== 0) return roleDiff;
    return a.displayName.localeCompare(b.displayName, "ko");
  });
}

interface AdminUserManagementPanelProps {
  initialUsers: AdminUserListItem[];
  departments: Department[];
  enabled: boolean;
  actorRole: UserRole;
  actorDepartmentId: string | null;
}

export function AdminUserManagementPanel({
  initialUsers,
  departments,
  enabled,
  actorRole,
  actorDepartmentId,
}: AdminUserManagementPanelProps) {
  const router = useRouter();
  const [openUsername, setOpenUsername] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>("user");
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [departmentFilterId, setDepartmentFilterId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<string | null>(
    enabled ? null : "현재 저장소에서는 사용자 계정을 수정할 수 없습니다.",
  );

  const isMaster = actorRole === "master";
  const manageableUsers = isMaster
    ? initialUsers
    : initialUsers.filter((user) =>
        user.departmentId === actorDepartmentId && (user.role === "user" || user.role === "sub_admin"),
      );
  const roleOptions: Array<{ value: UserRole; label: string }> = isMaster
    ? [
        { value: "user", label: "일반 사용자" },
        { value: "sub_admin", label: "부관리자" },
        { value: "admin", label: "관리자" },
        { value: "master", label: "마스터" },
      ]
    : [
        { value: "user", label: "일반 사용자" },
        { value: "sub_admin", label: "부관리자" },
      ];
  const openUser = openUsername ? (manageableUsers.find((u) => u.username === openUsername) ?? null) : null;

  useEffect(() => {
    if (openUser) {
      setRole(isMaster ? openUser.role : openUser.role === "sub_admin" ? "sub_admin" : "user");
      setDepartmentId(openUser.departmentId);
      setIsActive(openUser.isActive);
    }
  }, [isMaster, openUser]);

  useEffect(() => {
    if (departmentFilterId !== "all" && !departments.some((department) => department.id === departmentFilterId)) {
      setDepartmentFilterId("all");
    }
  }, [departmentFilterId, departments]);

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
          departmentId,
          isActive,
          password: null,
        }),
      });
      const data = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        setMessage(data.error ?? "저장에 실패했습니다.");
        return;
      }

      setMessage(data.message ?? "저장했습니다.");
      setOpenUsername(null);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(username: string) {
    setSaving(username);
    setMessage(null);
    setConfirmDelete(null);

    try {
      const response = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        setMessage(data.error ?? "삭제에 실패했습니다.");
        return;
      }

      setMessage(data.message ?? "계정을 비활성화했습니다.");
      setOpenUsername(null);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setSaving(null);
    }
  }

  const filteredUsers = sortUsers(
    manageableUsers.filter((user) => {
      const matchesDepartment = !isMaster || departmentFilterId === "all" || user.departmentId === departmentFilterId;
      const matchesSearch = user.displayName.includes(search.trim());
      return matchesDepartment && matchesSearch;
    }),
  );

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

      {isMaster ? (
        <div className="inline-row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className={departmentFilterId === "all" ? "button" : "button-subtle"}
            onClick={() => setDepartmentFilterId("all")}
          >
            전체
          </button>
          {departments.map((department) => (
            <button
              key={department.id}
              type="button"
              className={departmentFilterId === department.id ? "button" : "button-subtle"}
              onClick={() => setDepartmentFilterId(department.id)}
            >
              {department.name}
            </button>
          ))}
        </div>
      ) : null}

      {manageableUsers.length ? (
        <div className="mgmt-user-list">
          {filteredUsers.length ? filteredUsers.map((user) => {
            const isOpen = openUsername === user.username;
            const isSaving = saving === user.username;
            const isConfirmingDelete = confirmDelete === user.username;

            return (
              <div key={user.id} className={`mgmt-user-row${isOpen ? " mgmt-user-row-open" : ""}`}>
                <button
                  className="mgmt-user-header"
                  onClick={() => {
                    setConfirmDelete(null);
                    setOpenUsername(isOpen ? null : user.username);
                  }}
                  disabled={isSaving}
                >
                  <span className="mgmt-user-name">{isSaving ? "처리 중..." : user.displayName}</span>
                  <span className="badge">{getRoleLabel(user.role)}</span>
                  {!user.isActive && (
                    <span className="badge" style={{ background: "#e53e3e", color: "#fff" }}>비활성</span>
                  )}
                  <span className="mgmt-user-chevron">{isOpen ? "▲" : "▼"}</span>
                </button>

                {isOpen && (
                  <div className="mgmt-user-options" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <select
                        value={role}
                        disabled={!enabled || isSaving}
                        onChange={(e) => setRole(e.target.value as UserRole)}
                        style={{ flex: 1, fontSize: "0.82rem", height: 30, borderRadius: "var(--radius-sm)", border: "1px solid var(--line)", background: "rgba(255,255,255,0.7)", padding: "0 8px" }}
                      >
                        {roleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={departmentId ?? departments[0]?.id ?? ""}
                        disabled={!enabled || isSaving || departments.length === 0}
                        onChange={(e) => setDepartmentId(e.target.value)}
                        style={{ flex: 1, fontSize: "0.82rem", height: 30, borderRadius: "var(--radius-sm)", border: "1px solid var(--line)", background: "rgba(255,255,255,0.7)", padding: "0 8px" }}
                      >
                        {departments.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name}
                          </option>
                        ))}
                      </select>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.82rem", whiteSpace: "nowrap", cursor: enabled ? "pointer" : "default" }}>
                        <input
                          type="checkbox"
                          checked={isActive}
                          disabled={!enabled || isSaving}
                          onChange={(e) => setIsActive(e.target.checked)}
                        />
                        활성
                      </label>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <button
                        type="button"
                        className="button-subtle"
                        disabled={!enabled || isSaving}
                        onClick={() => handleSave(user)}
                        style={{ whiteSpace: "nowrap" }}
                      >
                        {isSaving ? "저장 중..." : "저장"}
                      </button>

                      {isConfirmingDelete ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: "0.82rem", color: "#e53e3e" }}>정말 비활성화할까요?</span>
                          <button
                            type="button"
                            className="button-subtle"
                            disabled={isSaving}
                            onClick={() => handleDelete(user.username)}
                            style={{ whiteSpace: "nowrap", color: "#e53e3e", borderColor: "#e53e3e" }}
                          >
                            비활성화 확인
                          </button>
                          <button
                            type="button"
                            className="button-subtle"
                            disabled={isSaving}
                            onClick={() => setConfirmDelete(null)}
                            style={{ whiteSpace: "nowrap" }}
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="button-subtle"
                          disabled={!enabled || isSaving}
                          onClick={() => setConfirmDelete(user.username)}
                          style={{ whiteSpace: "nowrap", fontSize: "0.82rem", color: "#e53e3e", borderColor: "#e53e3e" }}
                        >
                          계정 비활성화
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          }) : <div className="notice small">조건에 맞는 계정이 없습니다.</div>}
        </div>
      ) : (
        <div className="notice small">등록된 계정이 없습니다.</div>
      )}

      {message ? <div className="notice">{message}</div> : null}
    </div>
  );
}
