"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { AttendanceAction, AttendanceEventState, CoordinatePayload } from "@/lib/types";

interface AttendanceActionPanelProps {
  eventStates: AttendanceEventState[];
  devCoordinates: Partial<Record<AttendanceAction, CoordinatePayload>> | null;
  variant?: "default" | "quick";
}

function getCurrentPosition(): Promise<CoordinatePayload> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("이 브라우저는 위치 정보를 지원하지 않습니다."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: position.coords.accuracy,
        });
      },
      () => reject(new Error("위치 권한을 허용한 뒤 다시 시도하세요.")),
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    );
  });
}

function getVisibleStates(eventStates: AttendanceEventState[]) {
  return eventStates.filter((state) => state.implemented && state.action && state.visible && !state.occurredAt);
}

function getQuickActionStates(eventStates: AttendanceEventState[]) {
  const actionOrder: AttendanceAction[] = ["check-in", "tbm", "check-out"];

  return actionOrder
    .map((action) => {
      const candidates = eventStates.filter((state) => state.implemented && state.action === action);

      if (candidates.length === 0) {
        return null;
      }

      return (
        candidates.find((state) => state.visible && !state.occurredAt) ??
        candidates.find((state) => !state.occurredAt) ??
        candidates.find((state) => state.visible) ??
        candidates[0]
      );
    })
    .filter((state): state is AttendanceEventState => state !== null);
}

function getButtonLabel(state: AttendanceEventState): string {
  if (state.action === "tbm") {
    return "TBM";
  }

  if (state.action === "lunch-register") {
    return "점심 등록";
  }

  if (state.action === "lunch-out") {
    return "점심 출문";
  }

  if (state.action === "lunch-in") {
    return "점심 입문";
  }

  if (state.action === "check-in") {
    return "출근";
  }

  if (state.action === "check-out") {
    return "퇴근";
  }

  return state.label;
}

function getButtonClassName(state: AttendanceEventState): string {
  const classes = ["check-button"];

  if (state.action === "check-in") {
    classes.push("check-button-checkin");
  } else if (state.action === "tbm") {
    classes.push("check-button-tbm");
  } else if (state.action === "check-out") {
    classes.push("check-button-checkout");
  } else {
    classes.push("check-button-lunch");
  }

  if (!state.available) {
    classes.push("check-button-disabled");
  }

  return classes.join(" ");
}

function getStatusMessage(visibleStates: AttendanceEventState[], allStates: AttendanceEventState[]) {
  const availableState = visibleStates.find((state) => state.available);

  if (availableState) {
    return `${getButtonLabel(availableState)} 버튼을 눌러주세요.`;
  }

  const visibleReason = visibleStates[0]?.reason;

  if (visibleReason) {
    return visibleReason;
  }

  const nextPending = allStates.find((state) => state.action && !state.occurredAt);

  if (nextPending) {
    return nextPending.reason;
  }

  return "오늘 필요한 기록이 모두 완료되었습니다.";
}

export function AttendanceActionPanel({ eventStates, devCoordinates, variant = "default" }: AttendanceActionPanelProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<AttendanceAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const visibleStates = useMemo(() => getVisibleStates(eventStates), [eventStates]);
  const quickActionStates = useMemo(() => getQuickActionStates(eventStates), [eventStates]);
  const actionStates = variant === "quick" ? quickActionStates : visibleStates;
  const statusMessage = useMemo(() => getStatusMessage(visibleStates, eventStates), [eventStates, visibleStates]);

  async function submitAction(action: AttendanceAction, useDemoCoordinates: boolean) {
    setPendingAction(action);
    setMessage(null);

    try {
      const demoPayload = useDemoCoordinates && devCoordinates ? devCoordinates[action] : null;
      const payload = demoPayload ?? (await getCurrentPosition());
      const response = await fetch(`/api/attendance/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        setMessage(data.error ?? "기록 저장에 실패했습니다.");
        return;
      }

      setMessage(data.message ?? "기록이 저장되었습니다.");
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className={`check-panel${variant === "quick" ? " check-panel-quick" : ""}`}>
      <div className={`check-button-list${variant === "quick" ? " check-button-list-quick" : ""}`}>
        {actionStates.map((state) => {
          const action = state.action;
          const busy = action ? pendingAction === action : false;
          const canUseDemoCoordinates = variant === "default" && process.env.NODE_ENV !== "production" && action && devCoordinates?.[action];
          const disabled = !action || !state.available || pendingAction !== null || Boolean(state.occurredAt);

          return (
            <div key={state.code} className={`check-button-row${variant === "quick" ? " check-button-row-quick" : ""}`}>
              <button
                type="button"
                className={getButtonClassName(state)}
                disabled={disabled}
                onClick={() => {
                  if (action) {
                    void submitAction(action, false);
                  }
                }}
              >
                {busy ? "확인 중..." : getButtonLabel(state)}
              </button>
              {canUseDemoCoordinates ? (
                <button
                  type="button"
                  className="button-subtle check-demo-button"
                  disabled={disabled}
                  onClick={() => {
                    if (action) {
                      void submitAction(action, true);
                    }
                  }}
                >
                  데모 좌표
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="check-message">{message ?? statusMessage}</div>
    </div>
  );
}
