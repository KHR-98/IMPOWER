"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { Department, InviteLinkListItem, UserRole } from "@/lib/types";

interface AdminInviteLinkPanelProps {
  initialLinks: InviteLinkListItem[];
  departments: Department[];
  enabled: boolean;
  actorRole: UserRole;
  actorDepartmentId: string | null;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getStatusLabel(link: InviteLinkListItem): string {
  if (!link.isActive) return "폐기";
  if (Date.parse(link.expiresAt) <= Date.now()) return "만료";
  if (link.usedCount >= link.maxUses) return "사용 완료";
  return "활성";
}

function buildJoinUrl(token: string): string {
  return new URL(`/join/${token}`, window.location.origin).toString();
}

export function AdminInviteLinkPanel({
  initialLinks,
  departments,
  enabled,
  actorRole,
  actorDepartmentId,
}: AdminInviteLinkPanelProps) {
  const router = useRouter();
  const isMaster = actorRole === "master";
  const canManage = actorRole === "master" || actorRole === "admin";
  const actorDepartment = departments.find((department) => department.id === actorDepartmentId) ?? null;
  const manageableDepartments = useMemo(
    () => isMaster ? departments : actorDepartment ? [actorDepartment] : [],
    [actorDepartment, departments, isMaster],
  );
  const [departmentId, setDepartmentId] = useState(manageableDepartments[0]?.id ?? "");
  const [maxUses, setMaxUses] = useState(1);
  const [message, setMessage] = useState<string | null>(canManage ? null : "초대링크 관리 권한이 없습니다.");
  const [pending, setPending] = useState(false);
  const [generatedLinks, setGeneratedLinks] = useState<InviteLinkListItem[]>([]);
  const [hiddenLinkIds, setHiddenLinkIds] = useState<Set<string>>(() => new Set());
  const visibleInitialLinks = initialLinks.filter((link) => link.isActive && !hiddenLinkIds.has(link.id));
  const visibleGeneratedLinks = generatedLinks.filter((link) => link.isActive && !hiddenLinkIds.has(link.id));

  async function copyLink(token: string) {
    await navigator.clipboard.writeText(buildJoinUrl(token));
    setMessage("초대링크를 복사했습니다.");
  }

  async function createInitialLinks() {
    if (!isMaster) {
      setMessage("초기 가입 링크는 마스터만 생성할 수 있습니다.");
      return;
    }

    setPending(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/invite-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "initial" }),
      });
      const data = (await response.json()) as { error?: string; message?: string; links?: InviteLinkListItem[] };

      if (!response.ok) {
        setMessage(data.error ?? "초기 가입 링크 생성에 실패했습니다.");
        return;
      }

      setGeneratedLinks(data.links ?? []);
      setMessage(data.message ?? "초기 가입 링크를 생성했습니다.");
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function createStandardLink() {
    if (!canManage) {
      setMessage("초대링크 관리 권한이 없습니다.");
      return;
    }

    const effectiveDepartmentId = isMaster ? departmentId : actorDepartmentId;
    if (!effectiveDepartmentId) {
      setMessage("부서를 선택하세요.");
      return;
    }

    setPending(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/invite-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "standard",
          departmentId: effectiveDepartmentId,
          maxUses,
        }),
      });
      const data = (await response.json()) as { error?: string; message?: string; links?: InviteLinkListItem[] };

      if (!response.ok) {
        setMessage(data.error ?? "신규 가입 링크 생성에 실패했습니다.");
        return;
      }

      setGeneratedLinks(data.links ?? []);
      setMessage(data.message ?? "신규 가입 링크를 생성했습니다.");
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function deactivateLink(id: string) {
    setPending(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/invite-links", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        setMessage(data.error ?? "초대링크 폐기에 실패했습니다.");
        return;
      }

      setMessage(data.message ?? "초대링크를 폐기했습니다.");
      setHiddenLinkIds((current) => new Set(current).add(id));
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  }

  if (!canManage) {
    return null;
  }

  return (
    <section className="stack invite-link-panel">
      <div className="panel-header">
        <div>
          <h2 className="section-title">초대링크 관리</h2>
          <p className="section-subtitle">부서별 가입 링크를 생성하고 인원 제한을 관리합니다.</p>
        </div>
      </div>

      {isMaster ? (
        <div className="notice small invite-link-initial-box">
          <div className="invite-link-initial-action">
            <button type="button" className="button-subtle" disabled={!enabled || pending} onClick={createInitialLinks}>
              초기 가입 링크 생성
            </button>
          </div>
        </div>
      ) : null}

      <div className="invite-link-create-form">
        {isMaster ? (
          <label className="field invite-link-field">
            <span>부서</span>
            <select value={departmentId} disabled={!enabled || pending} onChange={(event) => setDepartmentId(event.target.value)}>
              {manageableDepartments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="field invite-link-field">
            <span>부서</span>
            <strong className="invite-link-fixed-department">{actorDepartment?.name ?? "부서 미지정"}</strong>
          </div>
        )}
        <label className="field invite-link-count-field">
          <span>인원</span>
          <input
            type="number"
            min={1}
            max={10}
            value={maxUses}
            disabled={!enabled || pending}
            onChange={(event) => setMaxUses(Math.min(10, Math.max(1, Number(event.target.value) || 1)))}
          />
        </label>
        <button type="button" className="button" disabled={!enabled || pending || manageableDepartments.length === 0} onClick={createStandardLink}>
          신규 링크 생성
        </button>
      </div>

      {visibleGeneratedLinks.length ? (
        <div className="notice small invite-link-generated-box">
          <strong>방금 생성된 링크</strong>
          <div className="invite-link-generated-list">
            {visibleGeneratedLinks.map((link) => link.token ? (
              <div key={link.id} className="invite-link-generated-row">
                <span className="invite-link-generated-meta">{link.departmentName} · {link.usedCount}/{link.maxUses}명 · {formatDateTime(link.expiresAt)}까지</span>
                <button type="button" className="button-subtle" onClick={() => copyLink(link.token as string)}>
                  복사
                </button>
              </div>
            ) : null)}
          </div>
        </div>
      ) : null}

      <div className="mgmt-user-list">
        {visibleInitialLinks.length ? visibleInitialLinks.map((link) => {
          const status = getStatusLabel(link);
          const canCopy = Boolean(link.token) && status === "활성";

          return (
            <div key={link.id} className="mgmt-user-row">
              <div className="mgmt-user-header" style={{ cursor: "default" }}>
                <span className="mgmt-user-name">{link.departmentName ?? "부서 미지정"}</span>
                <span className="badge">{link.linkType === "initial" ? "초기" : "신규"}</span>
                <span className="badge">{status}</span>
                <span className="badge">{link.usedCount}/{link.maxUses}명</span>
              </div>
              <div className="mgmt-user-options invite-link-row-options">
                <span className="section-subtitle">
                  만료 {formatDateTime(link.expiresAt)}
                </span>
                <div className="invite-link-row-actions">
                  <button type="button" className="button-subtle" disabled={!canCopy} onClick={() => link.token && copyLink(link.token)}>
                    링크 복사
                  </button>
                  <button type="button" className="button-subtle" disabled={!enabled || pending || !link.isActive} onClick={() => deactivateLink(link.id)}>
                    폐기
                  </button>
                </div>
              </div>
            </div>
          );
        }) : <div className="notice small">생성된 초대링크가 없습니다.</div>}
      </div>

      {message ? <div className="notice">{message}</div> : null}
    </section>
  );
}
