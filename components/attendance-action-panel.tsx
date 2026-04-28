"use client";

import { useMemo, useState } from "react";

import type { AttendanceAction, AttendanceEventState, CoordinatePayload } from "@/lib/types";

interface AttendanceActionPanelProps {
  eventStates: AttendanceEventState[];
  devCoordinates: Partial<Record<AttendanceAction, CoordinatePayload>> | null;
  variant?: "default" | "quick";
}

const MDM_REQUIRED_ACTIONS: AttendanceAction[] = ["check-in", "lunch-register", "lunch-in"];

type MdmCheckResult =
  | { ok: true; cameraTestResult: string }
  | { ok: false; error: string };

async function checkMdmViaCamera(): Promise<MdmCheckResult> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, error: "이 브라우저는 카메라 API를 지원하지 않습니다. Chrome 브라우저를 사용해주세요." };
  }

  let permState: PermissionState = "prompt";
  try {
    const status = await navigator.permissions.query({ name: "camera" as PermissionName });
    permState = status.state;
  } catch {
    // Permissions API를 지원하지 않는 브라우저 — getUserMedia로 진행
  }

  if (permState === "denied") {
    return {
      ok: false,
      error: "카메라 권한이 거부되어 있습니다. 브라우저 설정에서 카메라 권한을 허용 후 다시 시도하세요.",
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    // 카메라가 열림 = MDM 미활성 상태
    stream.getTracks().forEach((t) => t.stop());
    return {
      ok: false,
      error: "MDM 보안 프로그램이 활성화되지 않은 것으로 확인됩니다. MDM을 활성화한 후 다시 시도하세요.",
    };
  } catch (err) {
    const code = err instanceof DOMException ? err.name : "UnknownError";
    // 권한 요청 중 사용자가 거부한 경우 (MDM 아님)
    if (permState === "prompt" && code === "NotAllowedError") {
      return {
        ok: false,
        error: "카메라 권한을 허용해야 MDM 확인이 가능합니다. 권한 허용 후 다시 시도하세요.",
      };
    }
    // 권한은 허용됐으나 카메라가 차단됨 = MDM 활성 상태로 판단
    return { ok: true, cameraTestResult: code };
  }
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
  const actionOrder: AttendanceAction[] = ["check-in", "tbm", "lunch-register", "lunch-out", "lunch-in", "check-out"];

  return actionOrder
    .map((action) => {
      const candidates = eventStates.filter((state) => state.implemented && state.action === action);
      return candidates.find((state) => state.visible && !state.occurredAt) ?? null;
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

export function AttendanceActionPanel({ eventStates: initialEventStates, devCoordinates, variant = "default" }: AttendanceActionPanelProps) {
  const [eventStates, setEventStates] = useState<AttendanceEventState[]>(initialEventStates);
  const [pendingAction, setPendingAction] = useState<AttendanceAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const visibleStates = useMemo(() => getVisibleStates(eventStates), [eventStates]);
  const quickActionStates = useMemo(() => getQuickActionStates(eventStates), [eventStates]);
  const actionStates = variant === "quick" ? quickActionStates : visibleStates;
  const statusMessage = useMemo(() => getStatusMessage(visibleStates, eventStates), [eventStates, visibleStates]);

  async function submitAction(action: AttendanceAction, useDemoCoordinates: boolean) {
    setPendingAction(action);
    const requiresMdm = !useDemoCoordinates && MDM_REQUIRED_ACTIONS.includes(action);
    setMessage(requiresMdm ? "보안·위치 확인 중..." : "위치 확인 중...");

    try {
      const demoPayload = useDemoCoordinates && devCoordinates ? devCoordinates[action] : null;
      const [position, mdmResult] = await Promise.all([
        demoPayload ? Promise.resolve(demoPayload) : getCurrentPosition(),
        requiresMdm ? checkMdmViaCamera() : Promise.resolve(null),
      ]);

      if (mdmResult !== null && !mdmResult.ok) {
        setMessage(mdmResult.error);
        return;
      }

      setMessage(null);

      const body: Record<string, unknown> = { ...position };
      if (MDM_REQUIRED_ACTIONS.includes(action)) {
        if (useDemoCoordinates) {
          // 데모 모드에서는 MDM 검사 생략
          body.mdmVerified = true;
          body.cameraTestResult = "demo";
        } else if (mdmResult?.ok) {
          body.mdmVerified = true;
          body.cameraTestResult = mdmResult.cameraTestResult;
        }
      }

      const response = await fetch(`/api/attendance/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = (await response.json()) as { error?: string; message?: string; eventStates?: AttendanceEventState[] };

      if (!response.ok) {
        setMessage(data.error ?? "서버를 불러오지 못했습니다. 다시 시도해주세요.");
        return;
      }

      setMessage(data.message ?? "기록이 저장되었습니다.");
      if (data.eventStates) {
        setEventStates(data.eventStates);
      }
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
