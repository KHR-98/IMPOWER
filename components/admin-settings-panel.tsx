"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { KakaoZoneMap } from "@/components/kakao-zone-map";
import { CombinedTimeSettingsPicker } from "@/components/time-wheel-picker";
import type { AppSettings, Zone, ZoneType } from "@/lib/types";

const DEFAULT_ZONE_CENTER = {
  latitude: 37.03846289921283,
  longitude: 127.05679645475973,
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
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [zones, setZones] = useState<Zone[]>(initialZones);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(initialZones[0]?.id ?? null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(
    enabled ? null : "현재 저장소에서는 운영 설정을 수정할 수 없습니다.",
  );

  useEffect(() => {
    if (!zones.some((zone) => zone.id === selectedZoneId)) {
      setSelectedZoneId(zones[0]?.id ?? null);
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
          disabled={!enabled || pending}
        />

        <div className="field" style={{ maxWidth: 240 }}>
          <label htmlFor="max-gps-accuracy">GPS 허용 오차(m)</label>
          <input
            id="max-gps-accuracy"
            type="number"
            min={10}
            max={1000}
            value={settings.maxGpsAccuracyM}
            onChange={(event) => updateMaxGpsAccuracy(event.target.value)}
          />
        </div>
      </div>

      <KakaoZoneMap
        zones={zones}
        selectedZoneId={selectedZoneId}
        enabled={enabled}
        onSelectZone={setSelectedZoneId}
        onPickCoordinates={updateZoneCoordinates}
      />

      <div className="panel-header">
        <div>
          <h2 className="section-title">지점 편집</h2>
          <p className="section-subtitle">지점을 선택해 이름·유형·좌표·반경·활성 상태를 수정하세요.</p>
        </div>
        <button type="button" className="button-subtle" disabled={!enabled || pending} onClick={addZone}>
          지점 추가
        </button>
      </div>

      <div className="zone-editor-list">
        {zones.map((zone, index) => {
          const selected = zone.id === selectedZoneId;

          return (
            <div key={zone.id} className={`zone-editor-card stack${selected ? " zone-editor-card-selected" : ""}`}>
              <div className="zone-editor-header">
                <div className="inline-row">
                  <strong>지점 {index + 1}</strong>
                  <span className="badge">{zone.type === "tbm" ? "TBM" : "출입"}</span>
                  {selected ? <span className="status-pill status-ready">현재 선택됨</span> : null}
                </div>
                <button type="button" className="button-subtle" onClick={() => setSelectedZoneId(zone.id)}>
                  {selected ? "선택 중" : "선택"}
                </button>
              </div>
              <div className="settings-grid zone-editor-body">
                <div className="field">
                  <label htmlFor={`zone-name-${zone.id}`}>지점 이름</label>
                  <input
                    id={`zone-name-${zone.id}`}
                    type="text"
                    value={zone.name}
                    onChange={(event) => updateZone(zone.id, { name: event.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`zone-type-${zone.id}`}>지점 유형</label>
                  <select
                    id={`zone-type-${zone.id}`}
                    value={zone.type}
                    onChange={(event) => updateZone(zone.id, { type: event.target.value as ZoneType })}
                  >
                    <option value="entry">출입</option>
                    <option value="tbm">TBM</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`zone-lat-${zone.id}`}>위도</label>
                  <input
                    id={`zone-lat-${zone.id}`}
                    type="number"
                    step="0.000001"
                    value={zone.latitude}
                    onChange={(event) => updateZone(zone.id, { latitude: Number(event.target.value) })}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`zone-lng-${zone.id}`}>경도</label>
                  <input
                    id={`zone-lng-${zone.id}`}
                    type="number"
                    step="0.000001"
                    value={zone.longitude}
                    onChange={(event) => updateZone(zone.id, { longitude: Number(event.target.value) })}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`zone-radius-${zone.id}`}>반경(m)</label>
                  <input
                    id={`zone-radius-${zone.id}`}
                    type="number"
                    min={10}
                    max={5000}
                    value={zone.radiusM}
                    onChange={(event) => updateZone(zone.id, { radiusM: Number(event.target.value) })}
                  />
                </div>
                <label className="checkbox-row" htmlFor={`zone-active-${zone.id}`}>
                  <input
                    id={`zone-active-${zone.id}`}
                    type="checkbox"
                    checked={zone.isActive}
                    onChange={(event) => updateZone(zone.id, { isActive: event.target.checked })}
                  />
                  활성 지점으로 사용
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <div className="inline-row">
        <button type="button" className="button" disabled={!enabled || pending} onClick={handleSave}>
          {pending ? "저장 중..." : "운영 설정 저장"}
        </button>
      </div>
      {message ? <div className="notice">{message}</div> : null}
    </div>
  );
}

