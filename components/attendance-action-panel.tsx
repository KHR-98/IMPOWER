"use client";

import { useEffect, useMemo, useState } from "react";

import { isMdmRequiredAttendanceAction } from "@/lib/attendance-security";
import { getAllowedZoneTypes } from "@/lib/attendance-rules";
import { MANUAL_FALLBACK_STEPS } from "@/lib/consent-copy";
import { findMatchingZone } from "@/lib/geo";
import {
  buildAndroidBrowserIntentUrl,
  getInAppBrowserInfo,
  IN_APP_BROWSER_ATTENDANCE_MESSAGE,
  type InAppBrowserInfo,
} from "@/lib/in-app-browser";
import type {
  AccuracyCheckResult,
  AttendanceAction,
  AttendanceEventState,
  CameraTestResult,
  CoordinatePayload,
  Zone,
  ZoneCheckResult,
} from "@/lib/types";

interface AttendanceActionPanelProps {
  eventStates: AttendanceEventState[];
  devCoordinates: Partial<Record<AttendanceAction, CoordinatePayload>> | null;
  zones: Zone[];
  maxGpsAccuracyM: number;
  variant?: "default" | "quick";
}

const CHROME_ANDROID_PACKAGE = "com.android.chrome";
const SAMSUNG_INTERNET_ANDROID_PACKAGE = "com.sec.android.app.sbrowser";
const CHROME_STORE_URL = "https://play.google.com/store/apps/details?id=com.android.chrome";
const SAMSUNG_INTERNET_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.sec.android.app.sbrowser";

type CameraPolicyCheckResult =
  | { ok: true; cameraTestResult: CameraTestResult }
  | { ok: false; cameraTestResult: CameraTestResult; error: string };

type DeviceGuideKind = "ios" | "android" | "other";

interface CameraPermissionProbe {
  state: PermissionState;
  supported: boolean;
}

function buildCameraDiagnosticMessage(input: {
  title: string;
  diagnosis: string;
  action: string;
  detail?: string;
}): string {
  const lines = [
    input.title,
    `진단: ${input.diagnosis}`,
    `조치: ${input.action}`,
  ];

  if (input.detail) {
    lines.push(`상세: ${input.detail}`);
  }

  return lines.join("\n");
}

function getCameraErrorName(error: unknown): string {
  if (error instanceof DOMException) {
    return error.name;
  }

  if (error instanceof Error && error.name) {
    return error.name;
  }

  return "UnknownError";
}

function getCameraErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return null;
}

function formatCameraDetail(
  errorName: string,
  permission: CameraPermissionProbe,
  error: unknown = null,
): string {
  const detail = [
    `브라우저 오류=${errorName}`,
    permission.supported ? `권한 상태=${permission.state}` : "권한 상태 조회=미지원",
  ];
  const browserMessage = getCameraErrorMessage(error);

  if (browserMessage) {
    detail.push(`원문=${browserMessage}`);
  }

  return detail.join(", ");
}

async function getCameraPermissionProbe(): Promise<CameraPermissionProbe> {
  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({ name: "camera" as PermissionName });

      return {
        state: status.state,
        supported: true,
      };
    }
  } catch {
    // Permissions API를 지원하지 않거나 camera 권한 조회를 막는 브라우저는 getUserMedia 결과로 판단한다.
  }

  return {
    state: "prompt",
    supported: false,
  };
}

function isOverconstrainedCameraError(error: unknown): boolean {
  return getCameraErrorName(error) === "OverconstrainedError";
}

function isPolicyBlockedCameraStartFailure(errorCode: string, error: unknown): boolean {
  if (errorCode !== "NotReadableError" && errorCode !== "TrackStartError" && errorCode !== "AbortError") {
    return false;
  }

  const message = getCameraErrorMessage(error)?.toLowerCase() ?? "";

  return (
    message.includes("could not start video source") ||
    message.includes("could not start video") ||
    message.includes("starting videoinput failed") ||
    message.includes("security") ||
    message.includes("policy") ||
    message.includes("blocked") ||
    message.includes("보안") ||
    message.includes("정책") ||
    message.includes("차단") ||
    message.includes("사용할 수 없습니다")
  );
}

async function tryOpenCameraForPolicyCheck(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  } catch (error) {
    if (!isOverconstrainedCameraError(error)) {
      throw error;
    }

    // Some mobile/MDM browser stacks report the broad `{ video: true, audio: false }`
    // request as overconstrained. Retry with the simplest valid camera request before
    // deciding whether the camera is genuinely available.
    return navigator.mediaDevices.getUserMedia({ video: true });
  }
}

async function checkCameraRestrictionPolicy(): Promise<CameraPolicyCheckResult> {
  if (!navigator.mediaDevices?.getUserMedia) {
    const isSecureContext = window.isSecureContext;

    return {
      ok: false,
      cameraTestResult: "CAMERA_TEST_ERROR",
      error: buildCameraDiagnosticMessage({
        title: "카메라 확인을 시작할 수 없습니다.",
        diagnosis: isSecureContext
          ? "현재 브라우저가 카메라 API(getUserMedia)를 지원하지 않습니다."
          : "현재 페이지가 보안 컨텍스트가 아니어서 카메라 API를 사용할 수 없습니다.",
        action: "Chrome, 삼성 인터넷, Safari 같은 기본 브라우저에서 HTTPS 주소로 다시 열어주세요.",
        detail: `secureContext=${isSecureContext}`,
      }),
    };
  }

  const permission = await getCameraPermissionProbe();

  if (permission.state === "denied") {
    return {
      ok: false,
      cameraTestResult: "CAMERA_BLOCKED_OR_DENIED",
      error: buildCameraDiagnosticMessage({
        title: "브라우저에서 카메라 권한이 차단되어 있습니다.",
        diagnosis: "사이트 설정의 카메라 권한이 거부 상태입니다. 이 상태는 MDM 차단 확인으로 인정하지 않습니다.",
        action: "주소창 사이트 설정에서 카메라 권한 차단을 해제한 뒤, MDM/보안 앱의 카메라 제한 정책 상태를 다시 확인하세요.",
        detail: formatCameraDetail("PermissionDenied", permission),
      }),
    };
  }

  try {
    const stream = await tryOpenCameraForPolicyCheck();
    stream.getTracks().forEach((t) => t.stop());
    return {
      ok: false,
      cameraTestResult: "CAMERA_ACCESSIBLE",
      error: buildCameraDiagnosticMessage({
        title: "카메라 차단 정책이 비활성화된 상태로 보입니다.",
        diagnosis: "브라우저가 카메라를 실제로 열 수 있었습니다. 자동 출결은 카메라 제한 정책이 적용된 상태에서만 진행됩니다.",
        action: "MDM 또는 보안 앱을 활성화하고 카메라 제한 정책을 적용한 뒤 다시 시도하세요.",
        detail: formatCameraDetail("CameraAccessible", permission),
      }),
    };
  } catch (err) {
    const code = getCameraErrorName(err);

    if (code === "NotFoundError") {
      return {
        ok: false,
        cameraTestResult: "CAMERA_TEST_ERROR",
        error: buildCameraDiagnosticMessage({
          title: "카메라 장치를 찾지 못했습니다.",
          diagnosis: "브라우저가 사용할 수 있는 카메라 장치를 발견하지 못했습니다.",
          action: "기기 카메라가 비활성화되어 있지 않은지 확인하고, 외장 카메라 사용 시 연결 상태를 확인하세요.",
          detail: formatCameraDetail(code, permission, err),
        }),
      };
    }

    if (code === "OverconstrainedError") {
      return {
        ok: true,
        cameraTestResult: "CAMERA_BLOCKED_OR_DENIED",
      };
    }

    if (code === "NotReadableError" || code === "TrackStartError" || code === "AbortError") {
      if (isPolicyBlockedCameraStartFailure(code, err)) {
        return {
          ok: true,
          cameraTestResult: "CAMERA_BLOCKED_OR_DENIED",
        };
      }

      return {
        ok: false,
        cameraTestResult: "CAMERA_TEST_ERROR",
        error: buildCameraDiagnosticMessage({
          title: "카메라 장치를 열 수 없습니다.",
          diagnosis: "카메라가 다른 앱에서 사용 중이거나, OS/브라우저 설정에서 장치 접근이 막혀 있을 수 있습니다.",
          action: "카메라를 사용하는 다른 앱을 종료하고 브라우저 또는 기기 카메라 설정을 확인한 뒤 다시 시도하세요.",
          detail: formatCameraDetail(code, permission, err),
        }),
      };
    }

    if (code === "SecurityError" || code === "TypeError") {
      return {
        ok: false,
        cameraTestResult: "CAMERA_TEST_ERROR",
        error: buildCameraDiagnosticMessage({
          title: "브라우저 보안 설정 때문에 카메라 확인을 진행할 수 없습니다.",
          diagnosis: "보안 컨텍스트, 브라우저 정책, 또는 지원되지 않는 실행 환경 때문에 카메라 호출이 차단되었습니다.",
          action: "외부 기본 브라우저에서 HTTPS 주소로 다시 열고, 브라우저 카메라 권한과 보안 설정을 확인하세요.",
          detail: formatCameraDetail(code, permission, err),
        }),
      };
    }

    if (code === "NotAllowedError" && permission.state === "prompt") {
      return {
        ok: false,
        cameraTestResult: "CAMERA_BLOCKED_OR_DENIED",
        error: buildCameraDiagnosticMessage({
          title: "카메라 접근이 허용되지 않았습니다.",
          diagnosis: permission.supported
            ? "권한 요청 팝업이 거부되었거나 닫힌 상태로 보입니다."
            : "이 브라우저는 권한 상태 조회를 지원하지 않아 사용자 거부와 보안 정책 차단을 구분할 수 없습니다.",
          action: "브라우저 사이트 설정의 카메라 권한 상태와 MDM/보안 앱의 카메라 제한 정책 적용 여부를 함께 확인하세요.",
          detail: formatCameraDetail(code, permission, err),
        }),
      };
    }

    return { ok: true, cameraTestResult: "CAMERA_BLOCKED_OR_DENIED" };
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

function getInAppAttendanceMessage(info: InAppBrowserInfo): string {
  const label = info.label ?? "인앱 브라우저";
  return `${label}에서는 ${IN_APP_BROWSER_ATTENDANCE_MESSAGE}`;
}

function getDeviceGuideKind(userAgent: string | null): DeviceGuideKind {
  if (!userAgent) {
    return "other";
  }

  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && /Mobile/i.test(userAgent))) {
    return "ios";
  }

  if (/Android/i.test(userAgent)) {
    return "android";
  }

  return "other";
}

function getMdmGuideMessage(state: AttendanceEventState | null, deviceKind: DeviceGuideKind): string | null {
  if (!state?.action) {
    return null;
  }

  if (state.action === "check-in") {
    return deviceKind === "android"
      ? "입문 후 MDM 활성화 확인 후 출근 버튼을 눌러주세요."
      : "입문 전 MDM 활성화 확인 후 출근 버튼을 눌러주세요.";
  }

  if (state.action === "tbm") {
    return "TBM 전 MDM 확인 후 TBM 버튼을 눌러주세요.";
  }

  if (state.action === "lunch-register" || state.action === "lunch-out" || state.action === "lunch-in") {
    return "입·출문 전 MDM 확인 후 버튼을 눌러주세요.";
  }

  if (state.action === "check-out") {
    return "출문 전 MDM 확인 후 출문 뒤 퇴근 버튼을 눌러주세요.";
  }

  return null;
}

function findMatchingAllowedZone(
  zones: Zone[],
  state: AttendanceEventState,
  position: CoordinatePayload,
): Zone | null {
  for (const zoneType of getAllowedZoneTypes(state.code)) {
    const zone = findMatchingZone(zones, zoneType, position.latitude, position.longitude);

    if (zone) {
      return zone;
    }
  }

  return null;
}

function buildLocationCheckPayload(
  state: AttendanceEventState,
  position: CoordinatePayload,
  zones: Zone[],
  maxGpsAccuracyM: number,
):
  | { ok: true; zoneId: string; zoneCheckResult: ZoneCheckResult; accuracyCheckResult: AccuracyCheckResult }
  | { ok: false; message: string; zoneCheckResult: ZoneCheckResult; accuracyCheckResult: AccuracyCheckResult } {
  if (position.accuracyM > maxGpsAccuracyM) {
    return {
      ok: false,
      message: "위치 정확도 기준을 통과하지 못했습니다.",
      zoneCheckResult: "FAILED",
      accuracyCheckResult: "FAIL",
    };
  }

  const zone = findMatchingAllowedZone(zones, state, position);

  if (!zone) {
    return {
      ok: false,
      message: "허용된 입·출문 구역 안에서만 자동 앱 기반 입·출문을 사용할 수 있습니다.",
      zoneCheckResult: "NOT_ALLOWED",
      accuracyCheckResult: "PASS",
    };
  }

  return {
    ok: true,
    zoneId: zone.id,
    zoneCheckResult: "ALLOWED",
    accuracyCheckResult: "PASS",
  };
}

export function AttendanceActionPanel({
  eventStates: initialEventStates,
  devCoordinates,
  zones,
  maxGpsAccuracyM,
  variant = "default",
}: AttendanceActionPanelProps) {
  const [eventStates, setEventStates] = useState<AttendanceEventState[]>(initialEventStates);
  const [pendingAction, setPendingAction] = useState<AttendanceAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [manualFallbackReason, setManualFallbackReason] = useState<string | null>(null);
  const [userAgent, setUserAgent] = useState<string | null>(null);

  const visibleStates = useMemo(() => getVisibleStates(eventStates), [eventStates]);
  const quickActionStates = useMemo(() => getQuickActionStates(eventStates), [eventStates]);
  const actionStates = variant === "quick" ? quickActionStates : visibleStates;
  const guideState = useMemo(
    () => actionStates.find((state) => state.visible && state.action && !state.occurredAt) ?? null,
    [actionStates],
  );
  const inAppBrowser = useMemo(() => getInAppBrowserInfo(userAgent), [userAgent]);
  const mdmGuideMessage = useMemo(
    () => getMdmGuideMessage(guideState, getDeviceGuideKind(userAgent)),
    [guideState, userAgent],
  );
  const hasMdmRequiredAction = useMemo(
    () =>
      actionStates.some(
        (state) => state.action && isMdmRequiredAttendanceAction(state.action) && !state.occurredAt,
      ),
    [actionStates],
  );
  const inAppWarning =
    inAppBrowser.isInApp && hasMdmRequiredAction ? getInAppAttendanceMessage(inAppBrowser) : null;
  const statusMessage = useMemo(
    () => getStatusMessage(visibleStates, eventStates),
    [eventStates, visibleStates],
  );
  const displayMessage = message ?? inAppWarning ?? mdmGuideMessage ?? statusMessage;

  useEffect(() => {
    setUserAgent(window.navigator.userAgent);
  }, []);

  function openExternalBrowser(packageName: string, fallbackUrl: string) {
    const targetUrl = window.location.href;
    window.location.href = buildAndroidBrowserIntentUrl(targetUrl, packageName, fallbackUrl);
  }

  function showManualFallback(reason: string) {
    setMessage(reason);
    setManualFallbackReason(reason);
  }

  async function submitAction(state: AttendanceEventState, useDemoCoordinates: boolean) {
    const action = state.action;

    if (!action) {
      return;
    }

    const requiresMdm = !useDemoCoordinates && isMdmRequiredAttendanceAction(action);
    const currentInAppBrowser = getInAppBrowserInfo(window.navigator.userAgent);

    if (requiresMdm && currentInAppBrowser.isInApp) {
      showManualFallback(getInAppAttendanceMessage(currentInAppBrowser));
      return;
    }

    setPendingAction(action);
    setManualFallbackReason(null);
    setMessage(requiresMdm ? "보안·위치 확인 중..." : "위치 확인 중...");

    try {
      const demoPayload = useDemoCoordinates && devCoordinates ? devCoordinates[action] : null;
      const [position, cameraResult] = await Promise.all([
        demoPayload ? Promise.resolve(demoPayload) : getCurrentPosition(),
        requiresMdm ? checkCameraRestrictionPolicy() : Promise.resolve(null),
      ]);

      if (cameraResult !== null && !cameraResult.ok) {
        showManualFallback(cameraResult.error);
        return;
      }

      const locationCheck = buildLocationCheckPayload(state, position, zones, maxGpsAccuracyM);
      if (!locationCheck.ok) {
        showManualFallback(locationCheck.message);
        return;
      }

      setMessage(null);

      const body: Record<string, unknown> = {
        zoneId: locationCheck.zoneId,
        zoneCheckResult: locationCheck.zoneCheckResult,
        accuracyCheckResult: locationCheck.accuracyCheckResult,
      };
      if (isMdmRequiredAttendanceAction(action)) {
        if (useDemoCoordinates) {
          body.mdmVerified = true;
          body.cameraTestResult = "CAMERA_BLOCKED_OR_DENIED";
        } else if (cameraResult?.ok) {
          body.mdmVerified = true;
          body.cameraTestResult = cameraResult.cameraTestResult;
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
        showManualFallback(data.error ?? "서버를 불러오지 못했습니다.");
        return;
      }

      setMessage(data.message ?? "기록이 저장되었습니다.");
      setManualFallbackReason(null);
      if (data.eventStates) {
        setEventStates(data.eventStates);
      }
    } catch (error) {
      showManualFallback(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
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
          const blockedByInAppBrowser =
            inAppBrowser.isInApp && Boolean(action && isMdmRequiredAttendanceAction(action));
          const disabled =
            !action ||
            !state.available ||
            pendingAction !== null ||
            Boolean(state.occurredAt) ||
            blockedByInAppBrowser;

          return (
            <div key={state.code} className={`check-button-row${variant === "quick" ? " check-button-row-quick" : ""}`}>
              <button
                type="button"
                className={`${getButtonClassName(state)}${blockedByInAppBrowser ? " check-button-disabled" : ""}`}
                disabled={disabled}
                onClick={() => {
                  if (action) {
                    void submitAction(state, false);
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
                      void submitAction(state, true);
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

      {inAppWarning ? (
        <div className="notice small check-browser-warning">
          <strong>외부 브라우저로 열어주세요.</strong>
          <span>{inAppWarning}</span>
          <div className="check-browser-actions">
            <button
              type="button"
              className="button-subtle"
              onClick={() => openExternalBrowser(CHROME_ANDROID_PACKAGE, CHROME_STORE_URL)}
            >
              Chrome으로 열기
            </button>
            <button
              type="button"
              className="button-subtle"
              onClick={() => openExternalBrowser(SAMSUNG_INTERNET_ANDROID_PACKAGE, SAMSUNG_INTERNET_STORE_URL)}
            >
              삼성 인터넷으로 열기
            </button>
          </div>
        </div>
      ) : null}

      <div className={`check-message${manualFallbackReason ? " check-message-diagnostic" : ""}`}>
        {displayMessage}
      </div>
      {manualFallbackReason ? (
        <div className="notice small manual-fallback-box">
          <strong>자동 앱 기반 입·출문을 사용할 수 없습니다. 아래 수동 입·출문 절차를 진행하세요.</strong>
          <ol>
            {MANUAL_FALLBACK_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
