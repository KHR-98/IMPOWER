import type { RosterReasonCode } from "@/lib/types";

const SOURCE_REASON_PATTERN = /\|reason=([a-z_]+)$/;

export function getRosterReasonMessage(code: RosterReasonCode): string {
  switch (code) {
    case "not_listed":
      return "오늘 근무표에 이름이 없습니다.";
    case "sheet_missing":
      return "오늘 근무표를 찾지 못했습니다.";
    case "leave":
      return "연차로 근무 대상이 아닙니다.";
    case "half_day_am":
      return "오전 반차로 근무표 예외 인원입니다.";
    case "half_day_pm":
      return "오후 반차로 근무표 예외 인원입니다.";
    case "half_day":
      return "반차 일정은 운영 기준 확인이 필요합니다.";
    case "military":
      return "예비군 일정으로 일반 출결 대상이 아닙니다.";
    case "holiday":
      return "주말/공휴일은 명시된 인원만 근무 대상입니다.";
    case "blocked":
      return "근무표 예외/제외 항목으로 표시되었습니다.";
    case "not_synced":
      return "오늘 근무표가 아직 반영되지 않았습니다.";
    case "not_scheduled":
      return "오늘 근무 대상자가 아닙니다.";
  }
}

export function encodeRosterSourceKey(base: string | null, reasonCode: RosterReasonCode | null): string | null {
  if (!base && !reasonCode) {
    return null;
  }

  if (!reasonCode) {
    return base;
  }

  return `${base ?? "auto"}|reason=${reasonCode}`;
}

export function parseRosterReasonCodeFromSourceKey(sourceKey: string | null | undefined): RosterReasonCode | null {
  if (!sourceKey) {
    return null;
  }

  const matched = sourceKey.match(SOURCE_REASON_PATTERN)?.[1];

  switch (matched) {
    case "not_listed":
    case "sheet_missing":
    case "leave":
    case "half_day_am":
    case "half_day_pm":
    case "half_day":
    case "military":
    case "holiday":
    case "blocked":
    case "not_synced":
    case "not_scheduled":
      return matched;
    default:
      return null;
  }
}
