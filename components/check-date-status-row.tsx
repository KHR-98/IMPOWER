"use client";

import { useEffect, useState } from "react";
import type { AttendanceEventState } from "@/lib/types";

interface CheckDateStatusRowProps {
  dateLabel: string;
  initialEventStates: AttendanceEventState[];
}

export function CheckDateStatusRow({ dateLabel, initialEventStates }: CheckDateStatusRowProps) {
  const [eventStates, setEventStates] = useState<AttendanceEventState[]>(initialEventStates);

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ eventStates: AttendanceEventState[] }>).detail;
      if (detail?.eventStates) {
        setEventStates(detail.eventStates);
      }
    }
    window.addEventListener("attendance-state-updated", handler);
    return () => window.removeEventListener("attendance-state-updated", handler);
  }, []);

  const checkInDone = eventStates.some((s) => s.action === "check-in" && s.occurredAt != null);
  const checkOutDone = eventStates.some((s) => s.action === "check-out" && s.occurredAt != null);

  return (
    <div className="check-date-row">
      <span className="check-date">{dateLabel}</span>
      <span className={`check-status-badge ${checkInDone ? "check-status-badge-checkin" : "check-status-badge-inactive"}`}>
        출근
      </span>
      <span className={`check-status-badge ${checkOutDone ? "check-status-badge-checkout" : "check-status-badge-inactive"}`}>
        퇴근
      </span>
    </div>
  );
}
