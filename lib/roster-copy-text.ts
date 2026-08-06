import type { RosterEntry, RosterReasonCode } from "@/lib/types";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

// 사업장 접두 문구. "{SITE_PREFIX} {부서명}" 형태로 헤더에 쓰인다.
const SITE_PREFIX = "평택";
const NAMES_PER_ROW = 4;

// 부서별 상주인원 총원(고정값). 여기 지정된 부서는 이 값을 헤더 "총원(N명)"에 쓰고,
// 지정되지 않은 부서는 오늘 출근완료 인원 수를 그대로 쓴다. 값을 바꾸려면 이 표만 수정한다.
const DEPARTMENT_TOTAL_HEADCOUNT: Record<string, number> = {
  파운드리PCS: 11,
};

// 하단 특이사항 표기 순서와 라벨(운영 지정: 연차→예비군→교육→경조사→휴가→오전 반차→오후 반차).
const NOTE_ORDER: ReadonlyArray<{ code: RosterReasonCode; label: string }> = [
  { code: "leave", label: "연차" },
  { code: "military", label: "예비군" },
  { code: "education", label: "교육" },
  { code: "family_event", label: "경조사" },
  { code: "vacation", label: "휴가" },
  { code: "half_day_am", label: "오전 반차" },
  { code: "half_day_pm", label: "오후 반차" },
];

// 반차(반일 근무): 명단에서는 빼되 출근완료 인원에는 포함한다.
const HALF_DAY_CODES: ReadonlySet<RosterReasonCode> = new Set(["half_day_am", "half_day_pm"]);

// 계정이 없어도 항상 상주인원에 포함하는 예외 인원(부서별). 같은 이름의 실제 계정이 생기면
// 그 계정 데이터가 우선하고 아래 예외는 무시된다.
const PHANTOM_MEMBERS: ReadonlyArray<{ departmentName: string; displayName: string; careerRank: number }> = [
  { departmentName: "메모리PCS", displayName: "박명호", careerRank: 1 },
];

function isHalfDay(entry: RosterEntry): boolean {
  return entry.scheduleReasonCode != null && HALF_DAY_CODES.has(entry.scheduleReasonCode);
}

function buildPhantomEntries(entries: RosterEntry[], departmentName: string): RosterEntry[] {
  const existingNames = new Set(entries.map((entry) => entry.displayName.trim()));
  return PHANTOM_MEMBERS.filter(
    (member) => member.departmentName === departmentName && !existingNames.has(member.displayName),
  ).map((member) => ({
    id: `phantom:${member.displayName}`,
    workDate: "",
    username: `phantom:${member.displayName}`,
    displayName: member.displayName,
    isScheduled: true,
    shiftType: "day",
    allowLunchOut: false,
    scheduleReasonCode: null,
    careerRank: member.careerRank,
  }));
}

function formatDateLine(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map((part) => Number(part));
  if (!y || !m || !d) return dateKey;
  // 달력 날짜의 요일은 UTC 자정 기준으로 구하면 실행 환경 시간대의 영향을 받지 않는다.
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${String(m).padStart(2, "0")}월 ${String(d).padStart(2, "0")}일 (${weekday})`;
}

// 2음절 이름은 예시 양식에 맞춰 가운데를 벌려 표기한다("강건" → "강   건").
function formatGridName(name: string): string {
  const chars = [...name.trim()];
  return chars.length === 2 ? `${chars[0]}   ${chars[1]}` : name.trim();
}

// 경력순위 오름차순, 순위 없는 사람은 뒤로 보내고 가나다순.
function byCareer(a: RosterEntry, b: RosterEntry): number {
  const ra = a.careerRank ?? null;
  const rb = b.careerRank ?? null;
  if (ra != null && rb != null) return ra - rb;
  if (ra != null) return -1;
  if (rb != null) return 1;
  return a.displayName.localeCompare(b.displayName, "ko");
}

export function buildRosterText(rawEntries: RosterEntry[], departmentName: string, dateKey: string): string {
  // 계정 없는 예외 인원(예: 박명호)을 합쳐 항상 명단/카운트에 포함시킨다.
  const entries = [...rawEntries, ...buildPhantomEntries(rawEntries, departmentName)];

  // 오늘 상주(출근완료) 대상: 근무예정자 + 반차자. 연차/예비군/교육/경조사/휴가는 제외.
  const presentUsernames = new Set<string>();
  for (const entry of entries) {
    if (entry.isScheduled === true || isHalfDay(entry)) {
      presentUsernames.add(entry.username);
    }
  }

  // 명단(그리드): 상주 대상 중 반차 제외, 경력순, 4명씩 한 줄.
  const gridEntries = entries
    .filter((entry) => presentUsernames.has(entry.username) && !isHalfDay(entry))
    .slice()
    .sort(byCareer);

  const gridLines: string[] = [];
  for (let i = 0; i < gridEntries.length; i += NAMES_PER_ROW) {
    gridLines.push(
      gridEntries
        .slice(i, i + NAMES_PER_ROW)
        .map((entry) => formatGridName(entry.displayName))
        .join(" "),
    );
  }

  // 하단 특이사항: 지정 순서대로, 같은 사유는 한 줄에 이름을 나열.
  const noteLines: string[] = [];
  for (const { code, label } of NOTE_ORDER) {
    const names = entries
      .filter((entry) => entry.scheduleReasonCode === code)
      .sort(byCareer)
      .map((entry) => entry.displayName.trim());
    if (names.length > 0) noteLines.push(`${label} ${names.join(" ")}`);
  }

  return [
    formatDateLine(dateKey),
    `${SITE_PREFIX} ${departmentName} 상주인원  총원(${DEPARTMENT_TOTAL_HEADCOUNT[departmentName] ?? presentUsernames.size}명)`,
    "",
    ...gridLines,
    "",
    ...noteLines,
    `${presentUsernames.size}명 출근완료`,
  ].join("\n");
}
