"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { KakaoZoneMap } from "@/components/kakao-zone-map";
import { CombinedTimeSettingsPicker, type SettingsKey, type TimeSettingsSegment } from "@/components/time-wheel-picker";
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
type WeekendSettingsKey = "checkInWindow" | "lunchOutWindow" | "lunchInWindow" | "checkOutWindow";

const TIME_MODE_OPTIONS: Array<{ key: TimeSettingsMode; label: string }> = [
  { key: "weekday", label: "주간" },
  { key: "weekend", label: "주말" },
];

const WEEKDAY_TIME_GROUPS: Array<{
  title: string;
  segments: TimeSettingsSegment[];
}> = [
  {
    title: "주간조",
    segments: [
      { label: "주간조 출근 시작", key: "checkInWindow", field: "start" },
      { label: "주간조 출근 종료", key: "checkInWindow", field: "end" },
      { label: "주간조 점심 등록/출문 시작", key: "lunchOutWindow", field: "start" },
      { label: "주간조 점심 등록/출문 종료", key: "lunchOutWindow", field: "end" },
      { label: "주간조 점심 입문 시작", key: "lunchInWindow", field: "start" },
      { label: "주간조 점심 입문 종료", key: "lunchInWindow", field: "end" },
      { label: "주간조 퇴근 시작", key: "checkOutWindow", field: "start" },
      { label: "주간조 퇴근 종료", key: "checkOutWindow", field: "end" },
    ],
  },
  {
    title: "TBM",
    segments: [
      { label: "오전 TBM 시작", key: "tbmWindow", field: "start" },
      { label: "오전 TBM 종료", key: "tbmWindow", field: "end" },
      { label: "오후 TBM 시작", key: "tbmAfternoonWindow", field: "start" },
      { label: "오후 TBM 종료", key: "tbmAfternoonWindow", field: "end" },
      { label: "퇴근 TBM 시작", key: "tbmCheckoutWindow", field: "start" },
      { label: "퇴근 TBM 종료", key: "tbmCheckoutWindow", field: "end" },
    ],
  },
  {
    title: "늦조",
    segments: [
      { label: "늦조 출근 시작", key: "lateCheckInWindow", field: "start" },
      { label: "늦조 출근 종료", key: "lateCheckInWindow", field: "end" },
      { label: "늦조 점심 등록/출문 시작", key: "lateLunchOutWindow", field: "start" },
      { label: "늦조 점심 등록/출문 종료", key: "lateLunchOutWindow", field: "end" },
      { label: "늦조 점심 입문 시작", key: "lateLunchInWindow", field: "start" },
      { label: "늦조 점심 입문 종료", key: "lateLunchInWindow", field: "end" },
      { label: "늦조 퇴근 시작", key: "lateCheckOutWindow", field: "start" },
      { label: "늦조 퇴근 종료", key: "lateCheckOutWindow", field: "end" },
    ],
  },
];

const WEEKEND_TIME_SEGMENTS: TimeSettingsSegment[] = [
  { label: "주말 출근 시작", key: "checkInWindow", field: "start" },
  { label: "주말 출근 종료", key: "checkInWindow", field: "end" },
  { label: "주말 점심 등록/출문 시작", key: "lunchOutWindow", field: "start" },
  { label: "주말 점심 등록/출문 종료", key: "lunchOutWindow", field: "end" },
  { label: "주말 점심 입문 시작", key: "lunchInWindow", field: "start" },
  { label: "주말 점심 입문 종료", key: "lunchInWindow", field: "end" },
  { label: "주말 퇴근 시작", key: "checkOutWindow", field: "start" },
  { label: "주말 퇴근 종료", key: "checkOutWindow", field: "end" },
];

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
      lunchOutWindow: fallbackWindow(settings.dayShift.lunchOutWindow, settings.checkInWindow),
      lunchInWindow: fallbackWindow(settings.dayShift.lunchInWindow, settings.checkOutWindow),
      tbmAfternoonWindow: settings.tbmAfternoonWindow,
      tbmCheckoutWindow: settings.tbmCheckoutWindow,
      checkOutWindow: settings.checkOutWindow,
      lateCheckInWindow: settings.lateCheckInWindow,
      lateLunchOutWindow: fallbackWindow(settings.lateShift.lunchOutWindow, settings.lateCheckInWindow),
      lateLunchInWindow: fallbackWindow(settings.lateShift.lunchInWindow, settings.lateCheckOutWindow),
      lateCheckOutWindow: settings.lateCheckOutWindow,
    };
  }

  return {
    checkInWindow: department.dayShift.checkInWindow,
    tbmWindow: fallbackWindow(department.dayShift.tbmMorningWindow, department.dayShift.checkInWindow),
    lunchOutWindow: fallbackWindow(department.dayShift.lunchOutWindow, settings.dayShift.lunchOutWindow ?? department.dayShift.checkInWindow),
    lunchInWindow: fallbackWindow(department.dayShift.lunchInWindow, settings.dayShift.lunchInWindow ?? department.dayShift.checkOutWindow),
    tbmAfternoonWindow: fallbackWindow(department.dayShift.tbmAfternoonWindow, settings.tbmAfternoonWindow),
    tbmCheckoutWindow: fallbackWindow(department.dayShift.tbmCheckoutWindow, settings.tbmCheckoutWindow),
    checkOutWindow: department.dayShift.checkOutWindow,
    lateCheckInWindow: department.lateShift.checkInWindow,
    lateLunchOutWindow: fallbackWindow(department.lateShift.lunchOutWindow, settings.lateShift.lunchOutWindow ?? department.lateShift.checkInWindow),
    lateLunchInWindow: fallbackWindow(department.lateShift.lunchInWindow, settings.lateShift.lunchInWindow ?? department.lateShift.checkOutWindow),
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
  if (key === "lunchOutWindow") next.dayShift.lunchOutWindow = { ...fallbackWindow(next.dayShift.lunchOutWindow, fallbackSettings.dayShift.lunchOutWindow ?? next.dayShift.checkInWindow), [field]: value };
  if (key === "lunchInWindow") next.dayShift.lunchInWindow = { ...fallbackWindow(next.dayShift.lunchInWindow, fallbackSettings.dayShift.lunchInWindow ?? next.dayShift.checkOutWindow), [field]: value };
  if (key === "tbmAfternoonWindow") next.dayShift.tbmAfternoonWindow = { ...fallbackWindow(next.dayShift.tbmAfternoonWindow, fallbackSettings.tbmAfternoonWindow), [field]: value };
  if (key === "tbmCheckoutWindow") next.dayShift.tbmCheckoutWindow = { ...fallbackWindow(next.dayShift.tbmCheckoutWindow, fallbackSettings.tbmCheckoutWindow), [field]: value };
  if (key === "checkOutWindow") next.dayShift.checkOutWindow[field] = value;
  if (key === "lateCheckInWindow") next.lateShift.checkInWindow[field] = value;
  if (key === "lateLunchOutWindow") next.lateShift.lunchOutWindow = { ...fallbackWindow(next.lateShift.lunchOutWindow, fallbackSettings.lateShift.lunchOutWindow ?? next.lateShift.checkInWindow), [field]: value };
  if (key === "lateLunchInWindow") next.lateShift.lunchInWindow = { ...fallbackWindow(next.lateShift.lunchInWindow, fallbackSettings.lateShift.lunchInWindow ?? next.lateShift.checkOutWindow), [field]: value };
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
  const lunchOutFallback = department.dayShift.lunchOutWindow ?? fallbackSettings.dayShift.lunchOutWindow ?? department.dayShift.checkInWindow;
  const lunchInFallback = department.dayShift.lunchInWindow ?? fallbackSettings.dayShift.lunchInWindow ?? lunchOutFallback;
  const weekendShift: ShiftAttendanceSettings = {
    ...baseShift,
    checkInWindow: cloneWindow(baseShift.checkInWindow),
    tbmMorningWindow: null,
    lunchOutWindow: baseShift.lunchOutWindow ? cloneWindow(baseShift.lunchOutWindow) : cloneWindow(lunchOutFallback),
    lunchInWindow: baseShift.lunchInWindow ? cloneWindow(baseShift.lunchInWindow) : cloneWindow(lunchInFallback),
    tbmAfternoonWindow: null,
    tbmCheckoutWindow: null,
    checkOutWindow: cloneWindow(baseShift.checkOutWindow),
    earlyCheckOutWindow: null,
  };

  if (key === "checkInWindow") weekendShift.checkInWindow[field] = value;
  if (key === "lunchOutWindow") weekendShift.lunchOutWindow = { ...fallbackWindow(weekendShift.lunchOutWindow, lunchOutFallback), [field]: value };
  if (key === "lunchInWindow") weekendShift.lunchInWindow = { ...fallbackWindow(weekendShift.lunchInWindow, lunchInFallback), [field]: value };
  if (key === "checkOutWindow") weekendShift.checkOutWindow[field] = value;

  return {
    ...department,
    weekendShift,
  };
}

interface WeekendTimeSettingsPickerProps {
  settings: ShiftAttendanceSettings;
  fallbackSettings: Record<SettingsKey, TimeWindow>;
  onChangeWindow: (key: WeekendSettingsKey, field: "start" | "end", value: string) => void;
  disabled?: boolean;
}

interface WeekdayTimeSettingsPickerProps {
  settings: Record<SettingsKey, TimeWindow>;
  onChangeWindow: (key: SettingsKey, field: "start" | "end", value: string) => void;
  disabled?: boolean;
}

function WeekdayTimeSettingsPicker({ settings, onChangeWindow, disabled }: WeekdayTimeSettingsPickerProps) {
  return (
    <div className="settings-grid weekday-time-settings-grid" style={{ width: "100%" }}>
      {WEEKDAY_TIME_GROUPS.map((group) => (
        <div key={group.title} className="stack weekday-time-settings-group">
          <div className="inline-row" style={{ gap: 8 }}>
            <span className="badge">{group.title}</span>
          </div>
          <CombinedTimeSettingsPicker
            settings={settings}
            segments={group.segments}
            onChangeWindow={onChangeWindow}
            disabled={disabled}
          />
        </div>
      ))}
    </div>
  );
}

function WeekendTimeSettingsPicker({ settings, fallbackSettings, onChangeWindow, disabled }: WeekendTimeSettingsPickerProps) {
  const lunchOutWindow = fallbackWindow(settings.lunchOutWindow, fallbackSettings.lunchOutWindow);
  const lunchInWindow = fallbackWindow(settings.lunchInWindow, fallbackSettings.lunchInWindow);
  const pickerSettings: Record<SettingsKey, TimeWindow> = {
    checkInWindow: settings.checkInWindow,
    tbmWindow: settings.checkInWindow,
    lunchOutWindow,
    lunchInWindow,
    tbmAfternoonWindow: settings.checkInWindow,
    tbmCheckoutWindow: settings.checkOutWindow,
    checkOutWindow: settings.checkOutWindow,
    lateCheckInWindow: settings.checkInWindow,
    lateLunchOutWindow: lunchOutWindow,
    lateLunchInWindow: lunchInWindow,
    lateCheckOutWindow: settings.checkOutWindow,
  };

  return (
    <div className="stack weekday-time-settings-group" style={{ width: "100%" }}>
      <div className="inline-row" style={{ gap: 8 }}>
        <span className="badge">주말</span>
      </div>
      <CombinedTimeSettingsPicker
        settings={pickerSettings}
        segments={WEEKEND_TIME_SEGMENTS}
        onChangeWindow={(key, field, value) => {
          if (key === "checkInWindow" || key === "lunchOutWindow" || key === "lunchInWindow" || key === "checkOutWindow") {
            onChangeWindow(key, field, value);
          }
        }}
        disabled={disabled}
      />
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
      : null,
  );
  const [zones, setZones] = useState<Zone[]>(initialZones);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(
    enabled ? (canEdit ? null : "운영 설정은 조회만 가능합니다.") : "현재 저장소에서는 운영 설정을 수정할 수 없습니다.",
  );
  const visibleDepartments = settings.departmentSettings.filter((department) => !isDeptAdmin || department.id === actorDepartmentId);
  const selectedDepartment = visibleDepartments.find((department) => department.id === selectedDepartmentId) ?? null;
  const selectedDepartmentHasWeekend = Boolean(selectedDepartment?.weekendShift);
  const timeModeOptions = TIME_MODE_OPTIONS.filter((option) => option.key === "weekday" || selectedDepartmentHasWeekend);
  const pickerSettings = getDepartmentPickerSettings(settings, selectedDepartment);
  const weekendSettings = getWeekendShiftSettings(settings, selectedDepartment);

  useEffect(() => {
    if (selectedZoneId !== null && !zones.some((zone) => zone.id === selectedZoneId)) {
      setSelectedZoneId(null);
    }
  }, [selectedZoneId, zones]);

  useEffect(() => {
    if (actorDepartmentId !== undefined) {
      setSelectedDepartmentId(actorDepartmentId);
      return;
    }

    if (selectedDepartmentId && !settings.departmentSettings.some((department) => department.id === selectedDepartmentId)) {
      setSelectedDepartmentId(null);
    }
  }, [actorDepartmentId, selectedDepartmentId, settings.departmentSettings]);

  useEffect(() => {
    if (selectedDepartmentId && timeMode === "weekend" && !selectedDepartmentHasWeekend) {
      setTimeMode("weekday");
    }
  }, [selectedDepartmentHasWeekend, selectedDepartmentId, timeMode]);

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

    if (
      key === "lunchOutWindow" ||
      key === "lunchInWindow" ||
      key === "lateLunchOutWindow" ||
      key === "lateLunchInWindow"
    ) {
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
        {visibleDepartments.length > 0 ? (
          <div className={`admin-settings-department-list${visibleDepartments.length > 1 ? " admin-settings-department-list-grid" : ""}`}>
            {visibleDepartments.map((department) => (
              <button
                key={department.id}
                type="button"
                className={`button-subtle admin-settings-choice-button admin-settings-department-button${department.id === selectedDepartmentId ? " admin-settings-choice-button-selected admin-settings-department-button-selected" : ""}`}
                aria-pressed={department.id === selectedDepartmentId}
                disabled={!enabled || pending || isDeptAdmin}
                onClick={() => {
                  setSelectedDepartmentId(department.id);
                  if (timeMode === "weekend" && !department.weekendShift) {
                    setTimeMode("weekday");
                  }
                }}
              >
                {department.name}
              </button>
            ))}
          </div>
        ) : null}

        {selectedDepartment ? (
          <div className="inline-row admin-settings-time-mode-list">
            {timeModeOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`button-subtle admin-settings-choice-button admin-settings-time-mode-button${timeMode === option.key ? " admin-settings-choice-button-selected" : ""}`}
                aria-pressed={timeMode === option.key}
                disabled={!enabled || pending}
                onClick={() => setTimeMode(option.key)}
              >
                {selectedDepartment.name} {option.label}
              </button>
            ))}
          </div>
        ) : visibleDepartments.length > 0 ? (
          <div className="notice">부서를 선택하면 해당 부서의 주간/주말 시간 설정이 표시됩니다.</div>
        ) : (
          <div className="notice">시간 설정을 편집할 부서가 없습니다.</div>
        )}

        {selectedDepartment && timeMode === "weekday" ? (
          <WeekdayTimeSettingsPicker
            settings={pickerSettings}
            onChangeWindow={updateTimeWindow}
            disabled={!isEditing || !enabled || !canEdit || pending}
          />
        ) : selectedDepartment ? (
          <WeekendTimeSettingsPicker
            settings={weekendSettings}
            fallbackSettings={pickerSettings}
            onChangeWindow={updateWeekendTimeWindow}
            disabled={!isEditing || !enabled || !canEdit || pending}
          />
        ) : null}

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

