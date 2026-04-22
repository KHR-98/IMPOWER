"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const ITEM_H = 44;   // px — touch target height per item
const PAD_H = 88;    // px — 2 × ITEM_H, top/bottom spacer so first/last items can be centred

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

const HOURS   = Array.from({ length: 24 }, (_, i) => pad2(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad2(i));

/* ── Single scrollable column ─────────────────── */
interface WheelColProps {
  items: string[];
  value: number;
  onChange: (index: number) => void;
  disabled?: boolean;
  segMode?: boolean;
}

function WheelCol({ items, value, onChange, disabled, segMode }: WheelColProps) {
  const colRef     = useRef<HTMLDivElement>(null);
  const scrolling  = useRef(false);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Instant scroll to initial position on mount (no animation)
  useEffect(() => {
    const el = colRef.current;
    if (el) el.scrollTop = value * ITEM_H;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Programmatic scroll when value changes from parent (skip if user is scrolling)
  useEffect(() => {
    const el = colRef.current;
    if (!el || scrolling.current) return;
    el.scrollTo({ top: value * ITEM_H, behavior: "smooth" });
  }, [value]);

  const onScroll = useCallback(() => {
    scrolling.current = true;
    if (timerRef.current !== null) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      scrolling.current = false;
      const el = colRef.current;
      if (!el) return;

      const raw   = el.scrollTop / ITEM_H;
      const index = Math.max(0, Math.min(items.length - 1, Math.round(raw)));

      // Snap to exact grid position
      el.scrollTo({ top: index * ITEM_H, behavior: "smooth" });
      onChangeRef.current(index);
    }, 150);
  }, [items.length]);

  return (
    <div
      ref={colRef}
      className={`wheel-col${disabled ? " wheel-col--off" : ""}${segMode ? " wheel-col--seg" : ""}`}
      onScroll={disabled ? undefined : onScroll}
    >
      <div className="wheel-pad" aria-hidden="true" />
      {items.map((label, i) => (
        <div
          key={i}
          className={`wheel-item${i === value ? " wheel-item--on" : ""}`}
          aria-hidden="true"
        >
          {label}
        </div>
      ))}
      <div className="wheel-pad" aria-hidden="true" />
    </div>
  );
}

/* ── Public component ─────────────────────────── */
export interface TimeWheelPickerProps {
  label: string;
  value: string;           // "HH:MM"
  onChange: (v: string) => void;
  disabled?: boolean;
}

export function TimeWheelPicker({ label, value, onChange, disabled }: TimeWheelPickerProps) {
  const parts  = value.split(":");
  const hour   = Math.max(0, Math.min(23, parseInt(parts[0] ?? "0", 10) || 0));
  const minute = Math.max(0, Math.min(59, parseInt(parts[1] ?? "0", 10) || 0));

  const setHour = useCallback(
    (h: number) => {
      const [, m] = value.split(":").map((s) => parseInt(s, 10) || 0);
      onChange(`${pad2(h)}:${pad2(Math.max(0, Math.min(59, m)))}`);
    },
    [value, onChange],
  );

  const setMinute = useCallback(
    (m: number) => {
      const [h] = value.split(":").map((s) => parseInt(s, 10) || 0);
      onChange(`${pad2(Math.max(0, Math.min(23, h)))}:${pad2(m)}`);
    },
    [value, onChange],
  );

  return (
    <div className={`wheel-picker${disabled ? " wheel-picker--off" : ""}`}>
      <div className="wheel-picker-lbl">{label}</div>
      <div className="wheel-picker-body">
        <WheelCol items={HOURS}   value={hour}   onChange={setHour}   disabled={disabled} />
        <div className="wheel-colon" aria-hidden="true">:</div>
        <WheelCol items={MINUTES} value={minute} onChange={setMinute} disabled={disabled} />
        {/* Decorative overlays — pointer-events: none in CSS */}
        <div className="wheel-hl"      aria-hidden="true" />
        <div className="wheel-fade-t"  aria-hidden="true" />
        <div className="wheel-fade-b"  aria-hidden="true" />
      </div>
      {/* Accessible text representation */}
      <span className="sr-only">{`${label} ${value}`}</span>
    </div>
  );
}

/* ── Combined Time Settings Picker ────────────── */
const SEGMENTS = [
  { label: "출근 시작", key: "checkInWindow"  as const, field: "start" as const },
  { label: "출근 종료", key: "checkInWindow"  as const, field: "end"   as const },
  { label: "TBM 시작",  key: "tbmWindow"      as const, field: "start" as const },
  { label: "TBM 종료",  key: "tbmWindow"      as const, field: "end"   as const },
  { label: "퇴근 시작", key: "checkOutWindow" as const, field: "start" as const },
  { label: "퇴근 종료", key: "checkOutWindow" as const, field: "end"   as const },
];

const SEGMENT_LABELS = SEGMENTS.map((s) => s.label);

type SettingsKey = "checkInWindow" | "tbmWindow" | "checkOutWindow";

export interface CombinedTimeSettingsPickerProps {
  settings: Record<SettingsKey, { start: string; end: string }>;
  onChangeWindow: (key: SettingsKey, field: "start" | "end", value: string) => void;
  disabled?: boolean;
}

export function CombinedTimeSettingsPicker({
  settings,
  onChangeWindow,
  disabled,
}: CombinedTimeSettingsPickerProps) {
  const [segIdx, setSegIdx] = useState(0);

  const seg         = SEGMENTS[segIdx];
  const currentTime = settings[seg.key][seg.field];

  const parts  = currentTime.split(":");
  const hour   = Math.max(0, Math.min(23, parseInt(parts[0] ?? "0", 10) || 0));
  const minute = Math.max(0, Math.min(59, parseInt(parts[1] ?? "0", 10) || 0));

  const setHour = useCallback(
    (h: number) => {
      const [, m] = currentTime.split(":").map((s) => parseInt(s, 10) || 0);
      onChangeWindow(seg.key, seg.field, `${pad2(h)}:${pad2(Math.max(0, Math.min(59, m)))}`);
    },
    [currentTime, seg.key, seg.field, onChangeWindow],
  );

  const setMinute = useCallback(
    (m: number) => {
      const [h] = currentTime.split(":").map((s) => parseInt(s, 10) || 0);
      onChangeWindow(seg.key, seg.field, `${pad2(Math.max(0, Math.min(23, h)))}:${pad2(m)}`);
    },
    [currentTime, seg.key, seg.field, onChangeWindow],
  );

  return (
    <div className={`combined-time-picker${disabled ? " wheel-picker--off" : ""}`}>
      {/* Segment selector wheel */}
      <div className="combined-seg-section">
        <div className="wheel-picker-lbl">구간</div>
        <div className="wheel-picker-body">
          <WheelCol
            items={SEGMENT_LABELS}
            value={segIdx}
            onChange={setSegIdx}
            disabled={disabled}
            segMode
          />
          <div className="wheel-hl"     aria-hidden="true" />
          <div className="wheel-fade-t" aria-hidden="true" />
          <div className="wheel-fade-b" aria-hidden="true" />
        </div>
      </div>

      {/* Vertical divider */}
      <div className="combined-divider" aria-hidden="true" />

      {/* Time picker wheel */}
      <div className="combined-time-section">
        <div className="wheel-picker-lbl">시간</div>
        <div className="wheel-picker-body">
          <WheelCol items={HOURS}   value={hour}   onChange={setHour}   disabled={disabled} />
          <div className="wheel-colon" aria-hidden="true">:</div>
          <WheelCol items={MINUTES} value={minute} onChange={setMinute} disabled={disabled} />
          <div className="wheel-hl"     aria-hidden="true" />
          <div className="wheel-fade-t" aria-hidden="true" />
          <div className="wheel-fade-b" aria-hidden="true" />
        </div>
      </div>

      <span className="sr-only">{`${seg.label} ${currentTime}`}</span>
    </div>
  );
}
