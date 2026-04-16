"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { AdminUserListItem, UserRole } from "@/lib/types";

interface AdminUserManagementPanelProps {
  initialUsers: AdminUserListItem[];
  enabled: boolean;
}

const NEW_USER_KEY = "__new__";

export function AdminUserManagementPanel({ initialUsers, enabled }: AdminUserManagementPanelProps) {
  const router = useRouter();
  const [selectedUsername, setSelectedUsername] = useState(initialUsers[0]?.username ?? NEW_USER_KEY);
  const [mode, setMode] = useState<"create" | "update">(initialUsers[0] ? "update" : "create");
  const [username, setUsername] = useState(initialUsers[0]?.username ?? "");
  const [displayName, setDisplayName] = useState(initialUsers[0]?.displayName ?? "");
  const [role, setRole] = useState<UserRole>(initialUsers[0]?.role ?? "user");
  const [isActive, setIsActive] = useState(initialUsers[0]?.isActive ?? true);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(
    enabled ? null : "현재 저장소에서는 사용자 계정을 수정할 수 없습니다.",
  );

  const selectedUser = initialUsers.find((user) => user.username === selectedUsername) ?? null;

  useEffect(() => {
    if (selectedUsername !== NEW_USER_KEY && !selectedUser) {
      setSelectedUsername(initialUsers[0]?.username ?? NEW_USER_KEY);
    }
  }, [initialUsers, selectedUser, selectedUsername]);

  useEffect(() => {
    if (!selectedUser) {
      setMode("create");
      setUsername("");
      setDisplayName("");
      setRole("user");
      setIsActive(true);
      setPassword("");
      return;
    }

    setMode("update");
    setUsername(selectedUser.username);
    setDisplayName(selectedUser.displayName);
    setRole(selectedUser.role);
    setIsActive(selectedUser.isActive);
    setPassword("");
  }, [selectedUser]);

  function handleNewUser() {
    setSelectedUsername(NEW_USER_KEY);
    setMessage(null);
  }

  async function handleSave() {
    setPending(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/users", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          username,
          displayName,
          role,
          isActive,
          password: password.trim() ? password.trim() : null,
        }),
      });
      const data = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        setMessage(data.error ?? "사용자 저장에 실패했습니다.");
        return;
      }

      setMessage(data.message ?? "사용자 정보를 저장했습니다.");
      setSelectedUsername(username);
      setPassword("");
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!selectedUser) {
      return;
    }

    const confirmed = window.confirm(`${selectedUser.displayName} 계정을 영구 삭제할까요? 기존 출퇴근 기록은 데이터베이스에 남습니다.`);

    if (!confirmed) {
      return;
    }

    setPending(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: selectedUser.username,
        }),
      });
      const data = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        setMessage(data.error ?? "사용자 삭제에 실패했습니다.");
        return;
      }

      setMessage(data.message ?? "계정을 삭제했습니다.");
      setSelectedUsername(initialUsers.find((user) => user.username !== selectedUser.username)?.username ?? NEW_USER_KEY);
      setPassword("");
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
          <p className="section-subtitle">계정 생성과 권한·활성 상태·비밀번호를 직접 관리합니다.</p>
        </div>
        <button type="button" className="button-subtle" disabled={!enabled || pending} onClick={handleNewUser}>
          새 사용자
        </button>
      </div>

      {initialUsers.length ? (
        <div className="zone-editor-list">
          {initialUsers.map((user) => {
            const selected = user.username === selectedUsername && mode === "update";

            return (
              <div key={user.id} className={`zone-editor-card stack${selected ? " zone-editor-card-selected" : ""}`}>
                <div className="zone-editor-header">
                  <div className="stack" style={{ gap: 8 }}>
                    <div className="inline-row">
                      <strong>{user.displayName}</strong>
                      <span className="badge">{user.role === "admin" ? "관리자" : "일반"}</span>
                      <span className={`status-pill ${user.isActive ? "status-ready" : "status-locked"}`}>
                        {user.isActive ? "활성" : "비활성"}
                      </span>
                    </div>
                    <div className="caption">로그인 ID: {user.username}</div>
                  </div>
                  <button type="button" className="button-subtle" onClick={() => setSelectedUsername(user.username)}>
                    {selected ? "선택 중" : "이 사용자 선택"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="notice small">등록된 계정이 없습니다. 아래 양식에서 첫 사용자를 추가하세요.</div>
      )}

      <div className="settings-grid">
        <div className="field">
          <label htmlFor="admin-user-username">로그인 ID</label>
          <input
            id="admin-user-username"
            type="text"
            value={username}
            disabled={mode === "update"}
            placeholder="예: kim 또는 worker01"
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="admin-user-display-name">표시 이름</label>
          <input
            id="admin-user-display-name"
            type="text"
            value={displayName}
            placeholder="예: 김민수"
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="admin-user-role">권한</label>
          <select id="admin-user-role" value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
            <option value="user">일반 사용자</option>
            <option value="admin">관리자</option>
          </select>
        </div>
        <label className="checkbox-row" htmlFor="admin-user-active">
          <input
            id="admin-user-active"
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          계정 활성화
        </label>
        <div className="field">
          <label htmlFor="admin-user-password">{mode === "create" ? "초기 비밀번호" : "새 비밀번호"}</label>
          <input
            id="admin-user-password"
            type="password"
            value={password}
            placeholder={mode === "create" ? "초기 비밀번호를 입력하세요" : "비워두면 기존 비밀번호 유지"}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
      </div>

      <div className="notice small">
        로그인 ID는 변경할 수 없습니다. 비밀번호를 비워두면 기존 비밀번호가 유지됩니다.
      </div>

      <div className="inline-row">
        <button type="button" className="button" disabled={!enabled || pending} onClick={handleSave}>
          {pending ? "저장 중..." : mode === "create" ? "사용자 생성" : "사용자 저장"}
        </button>
        {mode === "update" && selectedUser ? (
          <button type="button" className="button-danger" disabled={!enabled || pending} onClick={handleDelete}>
            계정 삭제
          </button>
        ) : null}
        {mode === "update" && selectedUser ? (
          <span className={`status-pill ${selectedUser.isActive ? "status-ready" : "status-locked"}`}>
            {selectedUser.isActive ? "현재 활성 계정" : "현재 비활성 계정"}
          </span>
        ) : null}
      </div>

      {message ? <div className="notice">{message}</div> : null}
    </div>
  );
}
