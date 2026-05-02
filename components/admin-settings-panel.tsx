"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { KakaoZoneMap } from "@/components/kakao-zone-map";
import { CombinedTimeSettingsPicker, TimeWheelPicker, type SettingsKey } from "@/components/time-wheel-picker";
import type { AppSettings, DepartmentAttendanceSettings, ShiftAttendanceSettings, TimeWindow, Zone, ZoneType } from "@/lib/types";

const DEFAULT_ZONE_CENTER = {
  latitude: 37.033164,
  longitude: 127.062364,
};

function isLegacyPlaceholderZone(zone: Zone) {
  const latitudeGap = Math.abs(zone.latitude - 37.56652);
  const longitudeGap = Math.abs(zone.longitude - 126.97802);

  return latitudeGap <= 0.0025 && longitudeGap <= 0.0025;
}

interface AdminSettingsPanelProps {
  initialSettings: AppSettings;
  initialZones: Zone[];
  enabled: boolean;
  canEdit?: boolean;
  actorDepartmentId?: string | null;
}

type TimeSettingsMode = "weekday" | "weekend";
type WeekendSettingsKey = "checkInWindow" | "checkOutWindow";

function createZoneDraft(zones: Zone[]): Zone {
  const fallbackZone = zones.find((zone) => !isLegacyPlaceholderZone(zone)) ?? zones[0];

  return {
    id: globalThis.crypto?.randomUUID?.() ?? `zone-${Date.now()}`,
    name: "",
    type: "entry",
    latitude: fallbackZone?.latitude ?? DEFAULT_ZONE_CENTER.latitude,
    longitude: fallbackZone?.longitude ?? DEFAULT_ZONE_CENTER.longitude,
    radiusM: fallbackZone?.radiusM ?? 100,
    isActive: true,
  };
}

function cloneWindow(window: TimeWindow): TimeWindow {
  return { start: window.start, end: window.end };
}

function fallbackWindow(window: TimeWindow | null, fallback: TimeWindow): TimeWindow {
  return window ? cloneWindow(window) : cloneWindow(fallback);
}

function getWeekendShiftSettings(
  settings: AppSettings,
  department: DepartmentAttendanceSettings | null,
): ShiftAttendanceSettings {
  return department?.weekendShift ?? settings.weekendShift ?? department?.dayShift ?? settings.dayShift;
}

function getDepartmentPickerSettings(
  settings: AppSettings,
  department: DepartmentAttendanceSettings | null,
): Record<SettingsKey, TimeWindow> {
  if (!department) {
    return {
      checkInWindow: settings.checkInWindow,
      tbmWindow: settings.tbmWindow,
      tbmAfternoonWindow: settings.tbmAfternoonWindow,
      tbmCheckoutWindow: settings.tbmCheckoutWindow,
      checkOutWindow: settings.checkOutWindow,
      lateCheckInWindow: settings.lateCheckInWindow,
      lateCheckOutWindow: settings.lateCheckOutWindow,
    };
  }

  return {
    checkInWindow: department.dayShift.checkInWindow,
    tbmWindow: fallbackWindow(department.dayShift.tbmMorningWindow, department.dayShift.checkInWindow),
    tbmAfternoonWindow: fallbackWindow(department.dayShift.tbmAfternoonWindow, settings.tbmAfternoonWindow),
    tbmCheckoutWindow: fallbackWindow(department.dayShift.tbmCheckoutWindow, settings.tbmCheckoutWindow),
    checkOutWindow: department.dayShift.checkOutWindow,
    lateCheckInWindow: department.lateShift.checkInWindow,
    lateCheckOutWindow: department.lateShift.checkOutWindow,
  };
}

function patchDepartmentWindow(
  department: DepartmentAttendanceSettings,
  key: SettingsKey,
  field: "start" | "end",
  value: string,
  fallbackSettings: AppSettings,
): DepartmentAttendanceSettings {
  const next: DepartmentAttendanceSettings = {
    ...department,
    dayShift: {
      ...department.dayShift,
      checkInWindow: cloneWindow(department.dayShift.checkInWindow),
      tbmMorningWindow: department.dayShift.tbmMorningWindow ? cloneWindow(department.dayShift.tbmMorningWindow) : null,
      lunchOutWindow: department.dayShift.lunchOutWindow ? cloneWindow(department.dayShift.lunchOutWindow) : null,
      lunchInWindow: department.dayShift.lunchInWindow ? cloneWindow(department.dayShift.lunchInWindow) : null,
      tbmAfternoonWindow: department.dayShift.tbmAfternoonWindow ? cloneWindow(department.dayShift.tbmAfternoonWindow) : null,
      tbmCheckoutWindow: department.dayShift.tbmCheckoutWindow ? cloneWindow(department.dayShift.tbmCheckoutWindow) : null,
      checkOutWindow: cloneWindow(department.dayShift.checkOutWindow),
      earlyCheckOutWindow: department.dayShift.earlyCheckOutWindow ? cloneWindow(department.dayShift.earlyCheckOutWindow) : null,
    },
    lateShift: {
      ...department.lateShift,
      checkInWindow: cloneWindow(department.lateShift.checkInWindow),
      tbmMorningWindow: department.lateShift.tbmMorningWindow ? cloneWindow(department.lateShift.tbmMorningWindow) : null,
      lunchOutWindow: department.lateShift.lunchOutWindow ? cloneWindow(department.lateShift.lunchOutWindow) : null,
      lunchInWindow: department.lateShift.lunchInWindow ? cloneWindow(department.lateShift.lunchInWindow) : null,
      tbmAfternoonWindow: department.lateShift.tbmAfternoonWindow ? cloneWindow(department.lateShift.tbmAfternoonWindow) : null,
      tbmCheckoutWindow: department.lateShift.tbmCheckoutWindow ? cloneWindow(department.lateShift.tbmCheckoutWindow) : null,
      checkOutWindow: cloneWindow(department.lateShift.checkOutWindow),
      earlyCheckOutWindow: department.lateShift.earlyCheckOutWindow ? cloneWindow(department.lateShift.earlyCheckOutWindow) : null,
    },
  };

  if (key === "checkInWindow") next.dayShift.checkInWindow[field] = value;
  if (key === "tbmWindow") next.dayShift.tbmMorningWindow = { ...fallbackWindow(next.dayShift.tbmMorningWindow, next.dayShift.checkInWindow), [field]: value };
  if (key === "tbmAfternoonWindow") next.dayShift.tbmAfternoonWindow = { ...fallbackWindow(next.dayShift.tbmAfternoonWindow, fallbackSettings.tbmAfternoonWindow), [field]: value };
  if (key === "tbmCheckoutWindow") next.dayShift.tbmCheckoutWindow = { ...fallbackWindow(next.dayShift.tbmCheckoutWindow, fallbackSettings.tbmCheckoutWindow), [field]: value };
  if (key === "checkOutWindow") next.dayShift.checkOutWindow[field] = value;
  if (key === "lateCheckInWindow") next.lateShift.checkInWindow[field] = value;
  if (key === "lateCheckOutWindow") next.lateShift.checkOutWindow[field] = value;

  return next;
}

function patchWeekendWindow(
  department: DepartmentAttendanceSettings,
  key: WeekendSettingsKey,
  field: "start" | "end",
  value: string,
  fallbackSettings: AppSettings,
): DepartmentAttendanceSettings {
  const baseShift = department.weekendShift ?? fallbackSettings.weekendShift ?? department.dayShift;
  const weekendShift: ShiftAttendanceSettings = {
    ...baseShift,
    checkInWindow: cloneWindow(baseShift.checkInWindow),
    tbmMorningWindow: null,
    lunchOutWindow: null,
    lunchInWindow: null,
    tbmAfternoonWindow: null,
    tbmCheckoutWindow: null,
    checkOutWindow: cloneWindow(baseShift.checkOutWindow),
    earlyCheckOutWindow: null,
  };

  weekendShift[key] = {
    ...weekendShift[key],
    [field]: value,
  };

  return {
    ...department,
    weekendShift,
  };
}

interface WeekendTimeSettingsPickerProps {
  settings: ShiftAttendanceSettings;
  onChangeWindow: (key: WeekendSettingsKey, field: "start" | "end", value: string) => void;
  disabled?: boolean;
}

function WeekendTimeSettingsPicker({ settings, onChangeWindow, disabled }: WeekendTimeSettingsPickerProps) {
  return (
    <div className="settings-grid" style={{ width: "100%" }}>
      <div className="stack" style={{ gap: 12 }}>
        <div className="inline-row" style={{ gap: 8 }}>
          <span className="badge">주말 출근</span>
          <span className="section-subtitle">
            {settings.checkInWindow.start} - {settings.checkInWindow.end}
          </span>
        </div>
        <div className="inline-row" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <TimeWheelPicker
            label="출근 시작"
            value={settings.checkInWindow.start}
            disabled={disabled}
            onChange={(nextValue) => onChangeWindow("checkInWindow", "start", nextValue)}
          />
          <TimeWheelPicker
            label="출근 종료"
            value={settings.checkInWindow.end}
            disabled={disabled}
            onChange={(nextValue) => onChangeWindow("checkInWindow", "end", nextValue)}
          />
        </div>
      </div>

      <div className="stack" style={{ gap: 12 }}>
        <div className="inline-row" style={{ gap: 8 }}>
          <span className="badge">주말 퇴근</span>
          <span className="section-subtitle">
            {settings.checkOutWindow.start} - {settings.checkOutWindow.end}
          </span>
        </div>
        <div className="inline-row" style={{ gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <TimeWheelPicker
            label="퇴근 시작"
            value={settings.checkOutWindow.start}
            disabled={disabled}
            onChange={(nextValue) => onChangeWindow("checkOutWindow", "start", nextValue)}
          />
          <TimeWheelPicker
            label="퇴근 종료"
            value={settings.checkOutWindow.end}
            disabled={disabled}
            onChange={(nextValue) => onChangeWindow("checkOutWindow", "end", nextValue)}
          />
        </div>
      </div>
    </div>
  );
}

export function AdminSettingsPanel({
  initialSettings,
  initialZones,
  enabled,
  canEdit = enabled,
  actorDepartmentId,
}: AdminSettingsPanelProps) {
  const router = useRouter();
  // undefined = master(전체), string = 부서 admin, null = 부서 미지정 admin
  const isDeptAdmin = actorDepartmentId !== undefined;
  const [isEditing, setIsEditing] = useState(false);
  const [isMapEditing, setIsMapEditing] = useState(false);
  const [timeMode, setTimeMode] = useState<TimeSettingsMode>("weekday");
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(
    actorDepartmentId !== undefined
      ? actorDepartmentId
      : initialSettings.departmentSettings[0]?.id ?? null,
  );
  const [zones, setZones] = useState<Zone[]>(initialZones);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(
    enabled ? (canEdit ? null : "운영 설정은 조회만 가능합니다.") : "현재 저장소에서는 운영 설정을 수정할 수 없습니다.",
  );

  useEffect(() => {
    if (selectedZoneId !== null && !zones.some((zone) => zone.id === selectedZoneId)) {
      setSelectedZoneId(null);
    }
  }, [selectedZoneId, zones]);

  useEffect(() => {
    if (actorDepartmentId) {
      setSelectedDepartmentId(actorDepartmentId);
      return;
    }

    if (settings.departmentSettings.length === 0) {
      setSelectedDepartmentId(null);
      return;
    }

    if (!selectedDepartmentId || !settings.departmentSettings.some((department) => department.id === selectedDepartmentId)) {
      setSelectedDepartmentId(settings.departmentSettings[0]?.id ?? null);
    }
  }, [actorDepartmentId, selectedDepartmentId, settings.departmentSettings]);

  const selectedDepartment = settings.departmentSettings.find((department) => department.id === selectedDepartmentId) ?? null;
  const pickerSettings = getDepartmentPickerSettings(settings, selectedDepartment);
  const weekendSettings = getWeekendShiftSettings(settings, selectedDepartment);

  function updateTimeWindow(key: SettingsKey, field: "start" | "end", value: string) {
    if (selectedDepartment) {
      setSettings((current) => ({
        ...current,
        departmentSettings: current.departmentSettings.map((department) =>
          department.id === selectedDepartment.id
            ? patchDepartmentWindow(department, key, field, value, current)
            : department,
        ),
      }));
      return;
    }

    setSettings((current) => ({
      ...current,
      [key]: {
        ...current[key],
        [field]: value,
      },
    }));
  }

  function updateWeekendTimeWindow(key: WeekendSettingsKey, field: "start" | "end", value: string) {
    if (!selectedDepartment) {
      return;
    }

    setSettings((current) => ({
      ...current,
      departmentSettings: current.departmentSettings.map((department) =>
        department.id === selectedDepartment.id
          ? patchWeekendWindow(department, key, field, value, current)
          : department,
      ),
    }));
  }

  function updateMaxGpsAccuracy(value: string) {
    setSettings((current) => ({
      ...current,
      maxGpsAccuracyM: Number(value),
    }));
  }

  function updateZone(id: string, patch: Partial<Zone>) {
    setZones((current) => current.map((zone) => (zone.id === id ? { ...zone, ...patch } : zone)));
  }

  function updateZoneCoordinates(id: string, latitude: number, longitude: number) {
    updateZone(id, { latitude, longitude });
  }

  function addZone() {
    const nextZone = createZoneDraft(zones);
    setZones((current) => [...current, nextZone]);
    setSelectedZoneId(nextZone.id);
  }

  function deleteZone() {
    if (!selectedZoneId) return;
    setZones((current) => current.filter((zone) => zone.id !== selectedZoneId));
    setSelectedZoneId(null);
  }

  async function handleSave() {
    setPending(true);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ settings, zones }),
      });
      const data = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        setMessage(data.error ?? "설정 저장에 실패했습니다.");
        return;
      }

      setMessage(data.message ?? "운영 설정을 저장했습니다.");
      setIsEditing(false);
      setIsMapEditing(false);
      startTransition(() => router.refresh());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack admin-settings-stack">
      <div className="panel-header">
        <div>
          <h2 className="section-title">운영 설정 편집</h2>
        </div>
        <button
          type="button"
          className={isEditing ? "button-subtle" : "button-subtle"}
          disabled={!enabled || !canEdit || pending}
          onClick={() => { setIsEditing((v) => !v); setIsMapEditing(false); setMessage(null); }}
        >
          {isEditing ? "취소" : "수정"}
        </button>
      </div>

      <div className="wheel-settings-wrap">
        <div className="inline-row" style={{ gap: 8, width: "100%", flexWrap: "wrap" }}>
          <button
            type="button"
            className={timeMode === "weekday" ? "button" : "button-subtle"}
            disabled={!enabled || pending}
            onClick={() => setTimeMode("weekday")}
          >
            주간
          </button>
          <button
            type="button"
            className={timeMode === "weekend" ? "button" : "button-subtle"}
            disabled={!enabled || pending || settings.departmentSettings.length === 0}
            onClick={() => setTimeMode("weekend")}
          >
            주말
          </button>
        </div>

        {settings.departmentSettings.length > 0 ? (
          <div className="inline-row" style={{ gap: 8, width: "100%", flexWrap: "wrap" }}>
            {settings.departmentSettings
              .filter((department) => !isDeptAdmin || department.id === actorDepartmentId)
              .map((department) => (
                <button
                  key={department.id}
                  type="button"
                  className={department.id === selectedDepartmentId ? "button" : "button-subtle"}
                  disabled={!enabled || pending || isDeptAdmin}
                  onClick={() => setSelectedDepartmentId(department.id)}
                >
                  {department.name}
                </button>
              ))}
          </div>
        ) : null}

        {timeMode === "weekday" ? (
          <CombinedTimeSettingsPicker
            settings={pickerSettings}
            onChangeWindow={updateTimeWindow}
            disabled={!isEditing || !enabled || !canEdit || pending}
          />
        ) : selectedDepartment ? (
          <WeekendTimeSettingsPicker
            settings={weekendSettings}
            onChangeWindow={updateWeekendTimeWindow}
            disabled={!isEditing || !enabled || !canEdit || pending}
          />
        ) : (
          <div className="notice">주말 시간을 수정할 부서를 먼저 선택해주세요.</div>
        )}

        <div className="field" style={{ maxWidth: 240 }}>
          <label htmlFor="max-gps-accuracy">GPS 허용 오차(m)</label>
          <input
            id="max-gps-accuracy"
            type="number"
            min={10}
            max={1000}
            value={settings.maxGpsAccuracyM}
            disabled={!isEditing || !enabled || !canEdit || pending}
            onChange={(event) => updateMaxGpsAccuracy(event.target.value)}
          />
        </div>
      </div>

      {!isDeptAdmin ? (
        <KakaoZoneMap
          zones={zones}
          selectedZoneId={selectedZoneId}
          enabled={enabled}
          isEditing={isMapEditing && canEdit}
          onToggleEditing={() => { if (canEdit) setIsMapEditing((v) => !v); }}
          onSelectZone={setSelectedZoneId}
          onPickCoordinates={updateZoneCoordinates}
        />
      ) : null}

      {!isDeptAdmin ? (
        <div className="panel-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="section-title">지점 편집</h2>
            <p className="section-subtitle">지점을 선택해 이름·유형·좌표·반경·활성 상태를 수정하세요.</p>
          </div>
          <div className="stack" style={{ gap: 6, flexShrink: 0 }}>
            <button type="button" className="button-subtle" disabled={!isMapEditing || !enabled || !canEdit || pending} onClick={addZone}>
              지점 추가
            </button>
           <button type="button" className="button-subtle" disabled={!isMapEditing || !enabled || !canEdit || pending || !selectedZoneId} onClick={deleteZone}>
              지점 삭제
            </button>
          </div>
        </div>
      ) : null}

      {!isDeptAdmin ? (
        <div className="zone-editor-list user-mgmt-grid">
          {zones.map((zone, index) => {
            const selected = zone.id === selectedZoneId;

            return (
              <div key={zone.id} className={`zone-editor-card stack${selected ? " zone-editor-card-selected" : ""}`} style={{ gap: 10 }}>
                <strong>{zone.name || `지점 ${index + 1}`}</strong>
                <div className="inline-row" style={{ gap: 6 }}>
                  <span className={`status-pill ${zone.isActive ? "status-ready" : "status-locked"}`}>
                    {zone.isActive ? "활성" : "비활성"}
                  </span>
                  <span className="badge">{zone.type === "tbm" ? "TBM" : "출입"}</span>
                </div>
                <button type="button" className="button-subtle" onClick={() => setSelectedZoneId(selected ? null : zone.id)}>
                  {selected ? "선택 중" : "선택"}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {!isDeptAdmin ? (() => {
        const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;
        if (!selectedZone) return null;
        return (
          <div className="settings-grid zone-editor-body">
            <div className="field">
              <label htmlFor={`zone-name-${selectedZone.id}`}>지점 이름</label>
              <input
                id={`zone-name-${selectedZone.id}`}
                type="text"
                value={selectedZone.name}
                disabled={!isMapEditing || !enabled || !canEdit || pending}
                onChange={(event) => updateZone(selectedZone.id, { name: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor={`zone-type-${selectedZone.id}`}>지점 유형</label>
              <select
                id={`zone-type-${selectedZone.id}`}
                value={selectedZone.type}
                disabled={!isMapEditing || !enabled || !canEdit || pending}
                onChange={(event) => updateZone(selectedZone.id, { type: event.target.value as ZoneType })}
              >
                <option value="entry">출입</option>
                <option value="tbm">TBM</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor={`zone-lat-${selectedZone.id}`}>위도</label>
              <input
                id={`zone-lat-${selectedZone.id}`}
                type="number"
                step="0.000001"
                value={selectedZone.latitude}
                disabled={!isMapEditing || !enabled || !canEdit || pending}
                onChange={(event) => updateZone(selectedZone.id, { latitude: Number(event.target.value) })}
              />
            </div>
            <div className="field">
              <label htmlFor={`zone-lng-${selectedZone.id}`}>경도</label>
              <input
                id={`zone-lng-${selectedZone.id}`}
                type="number"
                step="0.000001"
                value={selectedZone.longitude}
                disabled={!isMapEditing || !enabled || !canEdit || pending}
                onChange={(event) => updateZone(selectedZone.id, { longitude: Number(event.target.value) })}
              />
            </div>
            <div className="field">
              <label htmlFor={`zone-radius-${selectedZone.id}`}>반경(m)</label>
              <input
                id={`zone-radius-${selectedZone.id}`}
                type="number"
                min={10}
                max={5000}
                value={selectedZone.radiusM}
                disabled={!isMapEditing || !enabled || !canEdit || pending}
                onChange={(event) => updateZone(selectedZone.id, { radiusM: Number(event.target.value) })}
              />
            </div>
            <label className="checkbox-row" htmlFor={`zone-active-${selectedZone.id}`}>
              <input
                id={`zone-active-${selectedZone.id}`}
                type="checkbox"
                checked={selectedZone.isActive}
                disabled={!isMapEditing || !enabled || !canEdit || pending}
                onChange={(event) => updateZone(selectedZone.id, { isActive: event.target.checked })}
              />
              활성 지점으로 사용
            </label>
          </div>
        );
      })() : null}

      <div className="inline-row">
        <button
          type="button"
          className="button"
          disabled={(isDeptAdmin ? !isEditing : (!isEditing && !isMapEditing)) || !enabled || !canEdit || pending}
          onClick={handleSave}
        >
          {pending ? "저장 중..." : "운영 설정 저장"}
        </button>
      </div>
      {message ? <div className="notice">{message}</div> : null}
    </div>
  );
}

