"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { KakaoZoneMap } from "@/components/kakao-zone-map";
import { CombinedTimeSettingsPicker } from "@/components/time-wheel-picker";
import type { AppSettings, Zone, ZoneType } from "@/lib/types";

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
}

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

export function AdminSettingsPanel({ initialSettings, initialZones, enabled }: AdminSettingsPanelProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isMapEditing, setIsMapEditing] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [zones, setZones] = useState<Zone[]>(initialZones);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(
    enabled ? null : "현재 저장소에서는 운영 설정을 수정할 수 없습니다.",
  );

  useEffect(() => {
    if (selectedZoneId !== null && !zones.some((zone) => zone.id === selectedZoneId)) {
      setSelectedZoneId(null);
    }
  }, [selectedZoneId, zones]);

  function updateTimeWindow(key: keyof AppSettings, field: "start" | "end", value: string) {
    if (key === "maxGpsAccuracyM") {
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
          disabled={!enabled || pending}
          onClick={() => { setIsEditing((v) => !v); setIsMapEditing(false); setMessage(null); }}
        >
          {isEditing ? "취소" : "수정"}
        </button>
      </div>

      <div className="wheel-settings-wrap">
        <CombinedTimeSettingsPicker
          settings={{
            checkInWindow:      settings.checkInWindow,
            tbmWindow:          settings.tbmWindow,
            tbmAfternoonWindow: settings.tbmAfternoonWindow,
            tbmCheckoutWindow:  settings.tbmCheckoutWindow,
            checkOutWindow:     settings.checkOutWindow,
            lateCheckInWindow:  settings.lateCheckInWindow,
            lateCheckOutWindow: settings.lateCheckOutWindow,
          }}
          onChangeWindow={updateTimeWindow as (key: "checkInWindow" | "tbmWindow" | "tbmAfternoonWindow" | "tbmCheckoutWindow" | "checkOutWindow" | "lateCheckInWindow" | "lateCheckOutWindow", field: "start" | "end", value: string) => void}
          disabled={!isEditing || !enabled || pending}
        />

        <div className="field" style={{ maxWidth: 240 }}>
          <label htmlFor="max-gps-accuracy">GPS 허용 오차(m)</label>
          <input
            id="max-gps-accuracy"
            type="number"
            min={10}
            max={1000}
            value={settings.maxGpsAccuracyM}
            disabled={!isEditing || !enabled || pending}
            onChange={(event) => updateMaxGpsAccuracy(event.target.value)}
          />
        </div>
      </div>

      <KakaoZoneMap
        zones={zones}
        selectedZoneId={selectedZoneId}
        enabled={enabled}
        isEditing={isMapEditing}
        onToggleEditing={() => { setIsMapEditing((v) => !v); }}
        onSelectZone={setSelectedZoneId}
        onPickCoordinates={updateZoneCoordinates}
      />

      <div className="panel-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="section-title">지점 편집</h2>
          <p className="section-subtitle">지점을 선택해 이름·유형·좌표·반경·활성 상태를 수정하세요.</p>
        </div>
        <div className="stack" style={{ gap: 6, flexShrink: 0 }}>
          <button type="button" className="button-subtle" disabled={!isMapEditing || !enabled || pending} onClick={addZone}>
            지점 추가
          </button>
          <button type="button" className="button-subtle" disabled={!isMapEditing || !enabled || pending || !selectedZoneId} onClick={deleteZone}>
            지점 삭제
          </button>
        </div>
      </div>

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

      {(() => {
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
                disabled={!isMapEditing || !enabled || pending}
                onChange={(event) => updateZone(selectedZone.id, { name: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor={`zone-type-${selectedZone.id}`}>지점 유형</label>
              <select
                id={`zone-type-${selectedZone.id}`}
                value={selectedZone.type}
                disabled={!isMapEditing || !enabled || pending}
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
                disabled={!isMapEditing || !enabled || pending}
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
                disabled={!isMapEditing || !enabled || pending}
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
                disabled={!isMapEditing || !enabled || pending}
                onChange={(event) => updateZone(selectedZone.id, { radiusM: Number(event.target.value) })}
              />
            </div>
            <label className="checkbox-row" htmlFor={`zone-active-${selectedZone.id}`}>
              <input
                id={`zone-active-${selectedZone.id}`}
                type="checkbox"
                checked={selectedZone.isActive}
                disabled={!isMapEditing || !enabled || pending}
                onChange={(event) => updateZone(selectedZone.id, { isActive: event.target.checked })}
              />
              활성 지점으로 사용
            </label>
          </div>
        );
      })()}

      <div className="inline-row">
        <button type="button" className="button" disabled={(!isEditing && !isMapEditing) || !enabled || pending} onClick={handleSave}>
          {pending ? "저장 중..." : "운영 설정 저장"}
        </button>
      </div>
      {message ? <div className="notice">{message}</div> : null}
    </div>
  );
}

