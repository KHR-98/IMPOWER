"use client";

import { useEffect, useRef, useState } from "react";

import type { Zone } from "@/lib/types";

interface KakaoZoneMapProps {
  zones: Zone[];
  selectedZoneId: string | null;
  enabled: boolean;
  onSelectZone: (zoneId: string) => void;
  onPickCoordinates: (zoneId: string, latitude: number, longitude: number) => void;
}

type KakaoSdk = {
  maps: {
    load: (callback: () => void) => void;
    LatLng: new (latitude: number, longitude: number) => {
      getLat: () => number;
      getLng: () => number;
    };
    LatLngBounds: new () => {
      extend: (latLng: { getLat: () => number; getLng: () => number }) => void;
    };
    Map: new (
      container: HTMLDivElement,
      options: { center: { getLat: () => number; getLng: () => number }; level: number },
    ) => {
      setCenter: (latLng: { getLat: () => number; getLng: () => number }) => void;
      panTo: (latLng: { getLat: () => number; getLng: () => number }) => void;
      setBounds: (bounds: unknown) => void;
      relayout: () => void;
      getCenter: () => { getLat: () => number; getLng: () => number };
    };
    Marker: new (options: { position: { getLat: () => number; getLng: () => number } }) => {
      setMap: (map: unknown | null) => void;
    };
    Circle: new (options: {
      center: { getLat: () => number; getLng: () => number };
      radius: number;
      strokeWeight: number;
      strokeColor: string;
      strokeOpacity: number;
      strokeStyle: string;
      fillColor: string;
      fillOpacity: number;
    }) => {
      setMap: (map: unknown | null) => void;
    };
    InfoWindow: new (options: { content: string }) => {
      open: (map: unknown, marker: unknown) => void;
      close: () => void;
    };
    event: {
      addListener: (target: unknown, eventName: string, handler: (payload: any) => void) => void;
    };
    services: {
      Places: new () => {
        keywordSearch: (
          keyword: string,
          callback: (results: Array<{ place_name: string; x: string; y: string }>, status: string) => void,
          options?: { location?: unknown },
        ) => void;
      };
      Status: {
        OK: string;
      };
    };
  };
};

type KakaoWindow = Window & {
  kakao?: KakaoSdk;
};

let kakaoSdkPromise: Promise<KakaoSdk> | null = null;
const DEFAULT_MAP_CENTER = {
  latitude: 37.03846289921283,
  longitude: 127.05679645475973,
};
const LEGACY_PLACEHOLDER_CENTER = {
  latitude: 37.56652,
  longitude: 126.97802,
};

function isLegacyPlaceholderZone(zone: Zone) {
  const latitudeGap = Math.abs(zone.latitude - LEGACY_PLACEHOLDER_CENTER.latitude);
  const longitudeGap = Math.abs(zone.longitude - LEGACY_PLACEHOLDER_CENTER.longitude);

  return latitudeGap <= 0.0025 && longitudeGap <= 0.0025;
}

function areLegacyPlaceholderZones(zones: Zone[]) {
  return zones.length > 0 && zones.every(isLegacyPlaceholderZone);
}

function getMapCenter(zones: Zone[], selectedZoneId: string | null) {
  const selectedZone = zones.find((zone) => zone.id === selectedZoneId);

  if (selectedZone && !isLegacyPlaceholderZone(selectedZone)) {
    return {
      latitude: selectedZone.latitude,
      longitude: selectedZone.longitude,
    };
  }

  const firstRealZone = zones.find((zone) => !isLegacyPlaceholderZone(zone));

  if (firstRealZone) {
    return {
      latitude: firstRealZone.latitude,
      longitude: firstRealZone.longitude,
    };
  }

  if (areLegacyPlaceholderZones(zones)) {
    return DEFAULT_MAP_CENTER;
  }

  const fallback = selectedZone ?? zones[0];

  return {
    latitude: fallback?.latitude ?? DEFAULT_MAP_CENTER.latitude,
    longitude: fallback?.longitude ?? DEFAULT_MAP_CENTER.longitude,
  };
}

function getKakaoLoadFailureMessage(hostname: string) {
  return `카카오 지도를 불러오지 못했습니다. NEXT_PUBLIC_KAKAO_MAP_APP_KEY가 올바른지, Kakao Developers에 현재 도메인(${hostname})이 JavaScript 키 허용 도메인으로 등록됐는지 확인하세요.`;
}

function getPreferredLocalhostUrl() {
  return `http://localhost:3000${window.location.pathname}${window.location.search}`;
}

function getLocalhostOnlyMessage() {
  return `현재 카카오 지도는 ${window.location.host}가 아니라 localhost 도메인에서만 동작합니다. ${getPreferredLocalhostUrl()} 로 접속해 다시 확인하세요.`;
}

function loadKakaoSdk(appKey: string): Promise<KakaoSdk> {
  const kakaoWindow = window as KakaoWindow;

  if (window.location.hostname === "127.0.0.1") {
    return Promise.reject(new Error(getLocalhostOnlyMessage()));
  }

  if (kakaoWindow.kakao?.maps) {
    return new Promise((resolve) => {
      kakaoWindow.kakao?.maps.load(() => resolve(kakaoWindow.kakao as KakaoSdk));
    });
  }

  if (kakaoSdkPromise) {
    return kakaoSdkPromise;
  }

  kakaoSdkPromise = new Promise((resolve, reject) => {
    const kakaoWindow = window as KakaoWindow;
    const hostname = window.location.host || window.location.hostname || "현재 도메인";
    let timeoutId: number | null = window.setTimeout(() => {
      timeoutId = null;
      kakaoSdkPromise = null;
      reject(new Error(getKakaoLoadFailureMessage(hostname)));
    }, 10000);

    const cleanup = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const resolveLoadedSdk = () => {
      const loadedWindow = window as KakaoWindow;

      if (!loadedWindow.kakao?.maps) {
        cleanup();
        kakaoSdkPromise = null;
        reject(new Error(getKakaoLoadFailureMessage(hostname)));
        return;
      }

      loadedWindow.kakao.maps.load(() => {
        cleanup();
        resolve(loadedWindow.kakao as KakaoSdk);
      });
    };

    const handleScriptError = () => {
      cleanup();
      kakaoSdkPromise = null;
      reject(new Error(getKakaoLoadFailureMessage(hostname)));
    };

    if (kakaoWindow.kakao?.maps) {
      kakaoWindow.kakao.maps.load(() => {
        cleanup();
        resolve(kakaoWindow.kakao as KakaoSdk);
      });
      return;
    }

    const existingScript = document.querySelector('script[data-kakao-maps="true"]') as HTMLScriptElement | null;

    if (existingScript) {
      existingScript.addEventListener("load", resolveLoadedSdk, { once: true });
      existingScript.addEventListener("error", handleScriptError, {
        once: true,
      });

      if (existingScript.dataset.loaded === "true") {
        window.setTimeout(resolveLoadedSdk, 0);
      }

      return;
    }

    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false&libraries=services`;
    script.async = true;
    script.defer = true;
    script.dataset.kakaoMaps = "true";
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolveLoadedSdk();
    }, { once: true });
    script.addEventListener("error", handleScriptError, {
      once: true,
    });
    document.head.appendChild(script);
  });

  return kakaoSdkPromise;
}

function getZoneColors(zone: Zone, selectedZoneId: string | null) {
  const selected = zone.id === selectedZoneId;
  const accent = zone.type === "tbm" ? "#c96a13" : "#0f6d5f";

  return {
    strokeColor: accent,
    fillColor: selected ? accent : zone.type === "tbm" ? "#ffe7d1" : "#dff7f2",
    fillOpacity: selected ? 0.28 : 0.18,
    strokeOpacity: zone.isActive ? 0.85 : 0.35,
    strokeWeight: selected ? 3 : 2,
  };
}

export function KakaoZoneMap({ zones, selectedZoneId, enabled, onSelectZone, onPickCoordinates }: KakaoZoneMapProps) {
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const kakaoRef = useRef<KakaoSdk | null>(null);
  const overlayRefs = useRef<any[]>([]);
  const infoWindowRefs = useRef<any[]>([]);
  const preserveViewportRef = useRef(false);
  const previousViewportSignatureRef = useRef<string | null>(null);
  const zonesRef = useRef(zones);
  const selectedZoneIdRef = useRef<string | null>(selectedZoneId);
  const enabledRef = useRef(enabled);
  const onPickCoordinatesRef = useRef(onPickCoordinates);
  const onSelectZoneRef = useRef(onSelectZone);
  const [query, setQuery] = useState("");
  const [pendingSearch, setPendingSearch] = useState(false);
  const [status, setStatus] = useState<string | null>(
    appKey ? "지도를 준비하는 중입니다." : "카카오 지도 키를 추가하면 지도를 클릭해서 지점을 설정할 수 있습니다.",
  );

  useEffect(() => {
    zonesRef.current = zones;
  }, [zones]);

  useEffect(() => {
    selectedZoneIdRef.current = selectedZoneId;
  }, [selectedZoneId]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    onPickCoordinatesRef.current = onPickCoordinates;
  }, [onPickCoordinates]);

  useEffect(() => {
    onSelectZoneRef.current = onSelectZone;
  }, [onSelectZone]);

  useEffect(() => {
    if (!appKey || !mapContainerRef.current) {
      return;
    }

    let cancelled = false;

    loadKakaoSdk(appKey)
      .then((kakao) => {
        if (cancelled || !mapContainerRef.current || mapRef.current) {
          return;
        }

        kakaoRef.current = kakao;
        const initialCenter = getMapCenter(zonesRef.current, selectedZoneIdRef.current);
        const useCampusOverview = areLegacyPlaceholderZones(zonesRef.current);
        const map = new kakao.maps.Map(mapContainerRef.current, {
          center: new kakao.maps.LatLng(initialCenter.latitude, initialCenter.longitude),
          level: useCampusOverview ? 5 : 3,
        });

        mapRef.current = map;
        map.relayout();

        kakao.maps.event.addListener(map, "click", (mouseEvent: { latLng: { getLat: () => number; getLng: () => number } }) => {
          if (!enabledRef.current) {
            setStatus("수정 버튼을 눌러 편집 모드로 전환하세요.");
            return;
          }

          const zoneId = selectedZoneIdRef.current;

          if (!zoneId) {
            setStatus("먼저 수정할 지점을 선택하세요.");
            return;
          }

          preserveViewportRef.current = true;
          onPickCoordinatesRef.current(zoneId, mouseEvent.latLng.getLat(), mouseEvent.latLng.getLng());
          setStatus("지도를 클릭한 위치로 선택된 지점 좌표를 반영했습니다.");
        });

        setStatus("지도를 클릭하면 선택된 지점 좌표가 반영됩니다.");
      })
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : "카카오 지도를 불러오지 못했습니다.");
      });

    return () => {
      cancelled = true;
    };
  }, [appKey]);

  useEffect(() => {
    const kakao = kakaoRef.current;
    const map = mapRef.current;

    if (!kakao || !map) {
      return;
    }

    overlayRefs.current.forEach((overlay) => overlay.setMap(null));
    infoWindowRefs.current.forEach((infoWindow) => infoWindow.close());
    overlayRefs.current = [];
    infoWindowRefs.current = [];

    const viewportSignature = JSON.stringify(
      zones.map((zone) => ({
        id: zone.id,
        latitude: zone.latitude,
        longitude: zone.longitude,
        radiusM: zone.radiusM,
        isActive: zone.isActive,
        type: zone.type,
      })),
    );
    const viewportChanged = previousViewportSignatureRef.current !== viewportSignature;
    previousViewportSignatureRef.current = viewportSignature;

    const bounds = new kakao.maps.LatLngBounds();

    zones.forEach((zone) => {
      const center = new kakao.maps.LatLng(zone.latitude, zone.longitude);
      bounds.extend(center);

      const marker = new kakao.maps.Marker({ position: center });
      marker.setMap(map);

      const colors = getZoneColors(zone, selectedZoneId);
      const circle = new kakao.maps.Circle({
        center,
        radius: zone.radiusM,
        strokeWeight: colors.strokeWeight,
        strokeColor: colors.strokeColor,
        strokeOpacity: colors.strokeOpacity,
        strokeStyle: "solid",
        fillColor: colors.fillColor,
        fillOpacity: colors.fillOpacity,
      });
      circle.setMap(map);

      const infoWindow = new kakao.maps.InfoWindow({
        content: `<div style="padding:8px 10px;font-size:12px;white-space:nowrap;">${zone.name || "이름 없는 지점"}</div>`,
      });
      infoWindow.open(map, marker);

      kakao.maps.event.addListener(marker, "click", () => {
        onSelectZoneRef.current(zone.id);
        setStatus(`"${zone.name || "지점"}"을(를) 선택했습니다.`);
      });

      overlayRefs.current.push(marker, circle);
      infoWindowRefs.current.push(infoWindow);
    });

    if (preserveViewportRef.current) {
      preserveViewportRef.current = false;
      return;
    }

    if (!viewportChanged) {
      return;
    }

    if (areLegacyPlaceholderZones(zones)) {
      return;
    }

    const realZones = zones.filter((zone) => !isLegacyPlaceholderZone(zone));
    const effectiveZones = realZones.length > 0 ? realZones : zones;

    if (effectiveZones.length > 1) {
      const effectiveBounds = new kakao.maps.LatLngBounds();
      effectiveZones.forEach((zone) => {
        effectiveBounds.extend(new kakao.maps.LatLng(zone.latitude, zone.longitude));
      });
      map.setBounds(effectiveBounds);
    } else if (effectiveZones.length === 1) {
      map.setCenter(new kakao.maps.LatLng(effectiveZones[0].latitude, effectiveZones[0].longitude));
    }
  }, [zones, selectedZoneId]);

  useEffect(() => {
    const kakao = kakaoRef.current;
    const map = mapRef.current;
    const selectedZone = zones.find((zone) => zone.id === selectedZoneId);

    if (!kakao || !map || !selectedZone || isLegacyPlaceholderZone(selectedZone)) {
      return;
    }

    map.panTo(new kakao.maps.LatLng(selectedZone.latitude, selectedZone.longitude));
  }, [selectedZoneId, zones]);

  async function handleSearch() {
    const kakao = kakaoRef.current;
    const map = mapRef.current;

    if (!kakao || !map) {
      setStatus("카카오 지도가 아직 준비되지 않았습니다.");
      return;
    }

    if (!query.trim()) {
      setStatus("검색어를 입력하세요.");
      return;
    }

    setPendingSearch(true);

    try {
      const places = new kakao.maps.services.Places();
      const result = await new Promise<{ place_name: string; x: string; y: string } | null>((resolve) => {
        places.keywordSearch(
          query.trim(),
          (items, statusCode) => {
            if (statusCode !== kakao.maps.services.Status.OK || !items.length) {
              resolve(null);
              return;
            }

            resolve(items[0]);
          },
          {
            location: map.getCenter(),
          },
        );
      });

      if (!result) {
        setStatus("검색 결과를 찾지 못했습니다. 주소나 장소명을 조금 더 구체적으로 입력해보세요.");
        return;
      }

      map.panTo(new kakao.maps.LatLng(Number(result.y), Number(result.x)));
      setStatus(`"${result.place_name}" 위치로 지도를 이동했습니다. 필요하면 지도를 클릭해 선택된 지점에 반영하세요.`);
    } finally {
      setPendingSearch(false);
    }
  }

  function applyMapCenterToSelectedZone() {
    const map = mapRef.current;
    const zoneId = selectedZoneIdRef.current;

    if (!map || !zoneId) {
      setStatus("먼저 수정할 지점을 선택하세요.");
      return;
    }

    const center = map.getCenter();
    preserveViewportRef.current = true;
    onPickCoordinatesRef.current(zoneId, center.getLat(), center.getLng());
    setStatus("현재 지도 중심 좌표를 선택된 지점에 반영했습니다.");
  }

  function moveToCurrentLocation() {
    const kakao = kakaoRef.current;
    const map = mapRef.current;

    if (!kakao || !map) {
      setStatus("카카오 지도가 아직 준비되지 않았습니다.");
      return;
    }

    if (!navigator.geolocation) {
      setStatus("이 브라우저는 현재 위치 확인을 지원하지 않습니다.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        map.panTo(new kakao.maps.LatLng(position.coords.latitude, position.coords.longitude));
        setStatus("현재 위치로 지도를 이동했습니다. 필요하면 지도를 클릭해 지점에 반영하세요.");
      },
      () => {
        setStatus("현재 위치를 불러오지 못했습니다. 위치 권한을 확인하세요.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    );
  }

  return (
    <div className="stack map-panel">
      <div className="panel-header">
        <div>
          <h2 className="section-title">지도에서 지점 선택</h2>
          <p className="section-subtitle map-subtitle">검색 후 지도 클릭 또는 중심 좌표 적용으로 지점을 지정합니다.</p>
        </div>
      </div>

      <div className="search-row">
        <div className="search-input-group">
          <input
            className="map-search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="장소명 또는 주소"
            disabled={!appKey || pendingSearch || !enabled}
          />
          <button type="button" className="button-subtle search-btn" onClick={handleSearch} disabled={!appKey || pendingSearch || !enabled}>
            {pendingSearch ? "검색 중" : "검색"}
          </button>
        </div>
        <div className="search-action-group">
          <button type="button" className="button-subtle" onClick={moveToCurrentLocation} disabled={!appKey || !enabled}>
            내 위치
          </button>
          <button type="button" className="button-subtle" onClick={applyMapCenterToSelectedZone} disabled={!appKey || !selectedZoneId || !enabled}>
            중심 적용
          </button>
        </div>
      </div>

      <div ref={mapContainerRef} className="map-canvas" />
      {status ? <div className="notice small">{status}</div> : null}
    </div>
  );
}
