import type { AppSettings, ShiftAttendanceSettings, TimeWindow } from "@/lib/types";

function cloneWindow(window: TimeWindow | null): TimeWindow | null {
  return window ? { ...window } : null;
}

function cloneShiftSettings(settings: ShiftAttendanceSettings): ShiftAttendanceSettings {
  return {
    checkInWindow: { ...settings.checkInWindow },
    tbmMorningWindow: cloneWindow(settings.tbmMorningWindow),
    lunchOutWindow: cloneWindow(settings.lunchOutWindow),
    lunchInWindow: cloneWindow(settings.lunchInWindow),
    tbmAfternoonWindow: cloneWindow(settings.tbmAfternoonWindow),
    tbmCheckoutWindow: cloneWindow(settings.tbmCheckoutWindow),
    checkOutWindow: { ...settings.checkOutWindow },
    earlyCheckOutWindow: cloneWindow(settings.earlyCheckOutWindow),
  };
}

export const DEFAULT_DAY_SHIFT_SETTINGS: ShiftAttendanceSettings = {
  checkInWindow: { start: "06:00", end: "08:30" },
  tbmMorningWindow: { start: "06:00", end: "08:30" },
  lunchOutWindow: { start: "11:40", end: "13:30" },
  lunchInWindow: { start: "11:40", end: "13:30" },
  tbmAfternoonWindow: { start: "13:35", end: "13:45" },
  tbmCheckoutWindow: { start: "16:30", end: "16:45" },
  checkOutWindow: { start: "16:30", end: "18:00" },
  earlyCheckOutWindow: { start: "11:40", end: "13:00" },
};

export const DEFAULT_LATE_SHIFT_SETTINGS: ShiftAttendanceSettings = {
  checkInWindow: { start: "09:00", end: "11:00" },
  tbmMorningWindow: null,
  lunchOutWindow: { start: "13:50", end: "15:40" },
  lunchInWindow: { start: "13:50", end: "15:40" },
  tbmAfternoonWindow: null,
  tbmCheckoutWindow: null,
  checkOutWindow: { start: "19:30", end: "21:00" },
  earlyCheckOutWindow: null,
};

export function buildOperationalSettings(maxGpsAccuracyM: number = 100): AppSettings {
  return {
    checkInWindow: { ...DEFAULT_DAY_SHIFT_SETTINGS.checkInWindow },
    tbmWindow: { ...(DEFAULT_DAY_SHIFT_SETTINGS.tbmMorningWindow ?? DEFAULT_DAY_SHIFT_SETTINGS.checkInWindow) },
    checkOutWindow: { ...DEFAULT_DAY_SHIFT_SETTINGS.checkOutWindow },
    dayShift: cloneShiftSettings(DEFAULT_DAY_SHIFT_SETTINGS),
    lateShift: cloneShiftSettings(DEFAULT_LATE_SHIFT_SETTINGS),
    maxGpsAccuracyM,
  };
}
