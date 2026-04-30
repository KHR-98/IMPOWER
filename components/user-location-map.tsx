"use client";

import { useEffect, useRef, useState } from "react";

import type { Zone } from "@/lib/types";

type KakaoSdk = {
  maps: {
    load: (callback: () => void) => void;
    LatLng: new (latitude: number, longitude: number) => {
      getLat: () => number;
      getLng: () => number;
    };
    Map: new (
      container: HTMLDivElement,
      options: { center: { getLat: () => number; getLng: () => number }; level: number },
    ) => {
      setDraggable: (draggable: boolean) => void;
      setZoomable: (zoomable: boolean) => void;
      relayout: () => void;
      setBounds: (bounds: unknown) => void;
    };
    LatLngBounds: new () => {
      extend: (latLng: { getLat: () => number; getLng: () => number }) => void;
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
    CustomOverlay: new (options: { position: unknown; content: string; yAnchor?: number }) => {
      setMap: (map: unknown | null) => void;
    };
  };
};

type KakaoWindow = Window & { kakao?: KakaoSdk };

let sdkPromise: Promise<KakaoSdk> | null = null;

function loadKakaoSdk(appKey: string): Promise<KakaoSdk> {
  const win = window as KakaoWindow;

  if (window.location.hostname === "127.0.0.1") {
    return Promise.reject(
      new Error(`카카오 지도는 127.0.0.1이 아닌 localhost 도메인에서만 동작합니다. http://localhost:3000${window.location.pathname} 으로 접속하세요.`),
    );
  }

  if (win.kakao?.maps) {
    return new Promise((resolve) => {
      win.kakao?.maps.load(() => resolve(win.kakao as KakaoSdk));
    });
  }

  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const hostname = window.location.host || "현재 도메인";
    const failMsg = `카카오 지도를 불러오지 못했습니다. NEXT_PUBLIC_KAKAO_MAP_APP_KEY가 올바른지, Kakao Developers에 ${hostname}이(가) 허용 도메인으로 등록됐는지 확인하세요.`;

    let tid: number | null = window.setTimeout(() => {
      tid = null;
      sdkPromise = null;
      reject(new Error(failMsg));
    }, 10000);

    const cleanup = () => { if (tid !== null) { window.clearTimeout(tid); tid = null; } };

    const onLoad = () => {
      const w = window as KakaoWindow;
      if (!w.kakao?.maps) { cleanup(); sdkPromise = null; reject(new Error(failMsg)); return; }
      w.kakao.maps.load(() => { cleanup(); resolve(w.kakao as KakaoSdk); });
    };

    const onError = () => { cleanup(); sdkPromise = null; reject(new Error(failMsg)); };

    const existing = document.querySelector('script[data-kakao-maps="true"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", onLoad, { once: true });
      existing.addEventListener("error", onError, { once: true });
      if (existing.dataset.loaded === "true") window.setTimeout(onLoad, 0);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
    script.async = true;
    script.defer = true;
    script.dataset.kakaoMaps = "true";
    script.addEventListener("load", () => { script.dataset.loaded = "true"; onLoad(); }, { once: true });
    script.addEventListener("error", onError, { once: true });
    document.head.appendChild(script);
  });

  return sdkPromise;
}

function getInitialCenter(zones: Zone[]) {
  const active = zones.filter((z) => z.isActive);
  const target = active[0] ?? zones[0];
  return target
    ? { latitude: target.latitude, longitude: target.longitude }
    : { latitude: 37.033164, longitude: 127.062364 };
}

export function UserLocationMap({ zones }: { zones: Zone[] }) {
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const kakaoRef = useRef<KakaoSdk | null>(null);
  const zoneOverlaysRef = useRef<any[]>([]);
  const userDotRef = useRef<any>(null);
  const userRingRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const [status, setStatus] = useState<string | null>(
    appKey ? "지도를 준비하는 중입니다." : "NEXT_PUBLIC_KAKAO_MAP_APP_KEY가 설정되지 않았습니다.",
  );

  useEffect(() => {
    if (!appKey || !mapContainerRef.current) return;
    let cancelled = false;

    loadKakaoSdk(appKey)
      .then((kakao) => {
        if (cancelled || !mapContainerRef.current || mapRef.current) return;
        kakaoRef.current = kakao;
        const center = getInitialCenter(zones);
        const map = new kakao.maps.Map(mapContainerRef.current, {
          center: new kakao.maps.LatLng(center.latitude, center.longitude),
          level: 5,
        });
        mapRef.current = map;
        map.setDraggable(true);
        map.setZoomable(true);
        map.relayout();
        setMapReady(true);
        setStatus("현재 위치를 확인하는 중...");
      })
      .catch((err) => {
        setStatus(err instanceof Error ? err.message : "카카오 지도를 불러오지 못했습니다.");
      });

    return () => { cancelled = true; };
  // zones는 초기 센터 계산에만 쓰고 이후엔 별도 effect에서 처리하므로 deps에서 제외
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appKey]);

  useEffect(() => {
    const kakao = kakaoRef.current;
    const map = mapRef.current;
    if (!kakao || !map) return;

    zoneOverlaysRef.current.forEach((o) => o.setMap(null));
    zoneOverlaysRef.current = [];

    const bounds = new kakao.maps.LatLngBounds();

    zones.forEach((zone) => {
      const center = new kakao.maps.LatLng(zone.latitude, zone.longitude);
      bounds.extend(center);

      const accent = zone.type === "tbm" ? "#c96a13" : "#0f6d5f";
      const fill = zone.type === "tbm" ? "#ffe7d1" : "#dff7f2";

      const circle = new kakao.maps.Circle({
        center,
        radius: zone.radiusM,
        strokeWeight: 2,
        strokeColor: accent,
        strokeOpacity: zone.isActive ? 0.85 : 0.3,
        strokeStyle: "solid",
        fillColor: fill,
        fillOpacity: 0.2,
      });
      circle.setMap(map);

      const marker = new kakao.maps.Marker({ position: center });
      marker.setMap(map);

      const label = new kakao.maps.CustomOverlay({
        position: center,
        content: `<div style="padding:4px 10px;font-size:12px;font-weight:700;white-space:nowrap;background:#fff;border:1.5px solid ${accent};border-radius:20px;color:${accent};box-shadow:0 2px 8px rgba(0,0,0,0.15);pointer-events:none;">${zone.name || "이름 없는 지점"}</div>`,
        yAnchor: 3.2,
      });
      label.setMap(map);

      zoneOverlaysRef.current.push(circle, marker, label);
    });

    if (zones.length > 1) {
      map.setBounds(bounds);
    }
  }, [zones, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    const kakao = kakaoRef.current;
    const map = mapRef.current;
    if (!kakao || !map) return;

    if (!navigator.geolocation) {
      setStatus("이 브라우저는 위치 정보를 지원하지 않습니다.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const latLng = new kakao.maps.LatLng(latitude, longitude);

        userDotRef.current?.setMap(null);
        userRingRef.current?.setMap(null);

        const dot = new kakao.maps.CustomOverlay({
          position: latLng,
          content: `<div style="width:18px;height:18px;background:#2563eb;border:3px solid #ffffff;border-radius:50%;box-shadow:0 2px 8px rgba(37,99,235,0.55);"></div>`,
          yAnchor: 0.5,
        });
        dot.setMap(map);
        userDotRef.current = dot;

        const ring = new kakao.maps.Circle({
          center: latLng,
          radius: Math.max(accuracy, 5),
          strokeWeight: 1,
          strokeColor: "#2563eb",
          strokeOpacity: 0.35,
          strokeStyle: "solid",
          fillColor: "#2563eb",
          fillOpacity: 0.07,
        });
        ring.setMap(map);
        userRingRef.current = ring;

        setStatus(`현재 위치 확인됨 (정확도 약 ${Math.round(accuracy)}m)`);
      },
      () => {
        setStatus("위치 권한을 허용한 뒤 새로고침하세요.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      userDotRef.current?.setMap(null);
      userRingRef.current?.setMap(null);
    };
  }, [mapReady]);

  return (
    <div className="user-location-map-wrap">
      <div>
        <h2 className="section-title">출입가능구역</h2>
        <p className="section-subtitle" style={{ marginTop: 2, fontSize: "0.78rem" }}>
          현장 구역과 내 위치를 확인합니다.
        </p>
      </div>
      <div ref={mapContainerRef} className="user-location-map-canvas" />
      {status ? <div className="notice small">{status}</div> : null}
    </div>
  );
}
