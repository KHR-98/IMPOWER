import "server-only";

import { google } from "googleapis";

import { getRequiredEnv } from "@/lib/env";
import { encodeRosterSourceKey, getRosterReasonMessage } from "@/lib/roster-reasons";
import { getKoreaDateKey } from "@/lib/time";
import type { RosterReasonCode, RosterSyncUser, SheetRosterAssignment, SheetRosterSnapshot, SheetUserCandidateSnapshot, ShiftType } from "@/lib/types";

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9가-힣]+/g, "");
}

function normalizeName(value: string): string {
  return value
    .trim()
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function cleanName(value: string): string {
  return value.trim().replace(/\([^)]*\)/g, "").trim();
}

const monthTitlePattern = /^(?:1[0-2]|[1-9])월$/;
const ignoredNameTokens = new Set([
  "연차",
  "반차",
  "오전반차",
  "오후반차",
  "예비군",
  "휴가",
  "공휴일",
  "휴일",
  "조퇴",
  "출장",
  "교육",
  "외근",
  "사무",
  "비고",
  "없음",
  "x",
  "o",
  "t",
]);

function splitCandidateTokens(value: unknown): string[] {
  return String(value ?? "")
    .replace(/[,:;|/]/g, " ")
    .split(/\s+/)
    .map((part) => cleanName(part))
    .filter(Boolean);
}

function isPotentialPersonName(value: string): boolean {
  const normalized = cleanName(value).replace(/\s+/g, "");

  if (!normalized) {
    return false;
  }

  if (ignoredNameTokens.has(normalized)) {
    return false;
  }

  if (/^\d+$/.test(normalized)) {
    return false;
  }

  if (/공휴일|대체공휴일|대체휴일|개천절|광복절|삼일절|현충일|어린이날|한글날|성탄절|설날|추석/.test(normalized)) {
    return false;
  }

  return /^[A-Za-z가-힣]{2,12}$/.test(normalized);
}

function extractCandidateNamesFromCells(cells: unknown[]): string[] {
  const names: string[] = [];

  for (const cell of cells) {
    for (const token of splitCandidateTokens(cell)) {
      if (isPotentialPersonName(token)) {
        names.push(token);
      }
    }
  }

  return names;
}

function buildUniqueSortedNames(names: string[]): string[] {
  const map = new Map<string, string>();

  for (const name of names) {
    const key = normalizeName(name);
    if (!key || map.has(key)) {
      continue;
    }

    map.set(key, cleanName(name));
  }

  return [...map.values()].sort((left, right) => left.localeCompare(right, "ko"));
}

function normalizeDateValue(value: string, fallbackYear?: number): string | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const isoMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);

  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const koreanMonthDayMatch = trimmed.match(/^(\d{1,2})월\s*(\d{1,2})일$/);
  if (koreanMonthDayMatch && fallbackYear) {
    const [, month, day] = koreanMonthDayMatch;
    return `${String(fallbackYear)}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (usMatch) {
    const [, month, day, year] = usMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return getKoreaDateKey(parsed);
}

function splitNames(value: unknown): string[] {
  return String(value ?? "")
    .trim()
    .split(/\s+/)
    .map((part) => cleanName(part))
    .filter(Boolean);
}

function parseMonthlyMatrixSpecialCases(value: unknown): Array<{
  name: string;
  reasonCode: RosterReasonCode;
  reasonMessage: string;
}> {
  const entries: Array<{
    name: string;
    reasonCode: RosterReasonCode;
    reasonMessage: string;
  }> = [];
  const seen = new Set<string>();

  for (const rawToken of String(value ?? "")
    .replace(/[,:;|/]/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)) {
    const suffixMatch = rawToken.match(/^(.*?)(?:\((오전|오후|예)\))?$/);
    const rawName = suffixMatch?.[1] ?? rawToken;
    const marker = suffixMatch?.[2] ?? null;
    const name = cleanName(rawName);

    if (!isPotentialPersonName(name)) {
      continue;
    }

    const reasonCode = marker === "오전" ? "half_day_am" : marker === "오후" ? "half_day_pm" : marker === "예" ? "military" : "leave";
    const dedupeKey = `${normalizeName(name)}:${reasonCode}`;

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    entries.push({
      name,
      reasonCode,
      reasonMessage: getRosterReasonMessage(reasonCode),
    });
  }

  return entries;
}

function parseScheduledInfo(value: string | undefined): { isScheduled: boolean; reasonCode: RosterReasonCode | null } {
  if (!value) {
    return {
      isScheduled: true,
      reasonCode: null,
    };
  }

  const normalized = value.trim().toLowerCase();

  if (["휴가", "연차"].includes(normalized)) {
    return { isScheduled: false, reasonCode: "leave" };
  }

  if (["반차", "오전반차", "오후반차"].includes(normalized)) {
    return { isScheduled: false, reasonCode: "half_day" };
  }

  if (["예비군"].includes(normalized)) {
    return { isScheduled: false, reasonCode: "military" };
  }

  if (["0", "false", "n", "no", "x", "off"].includes(normalized)) {
    return { isScheduled: false, reasonCode: "not_scheduled" };
  }

  if (["1", "true", "y", "yes", "o", "ok", "scheduled", "근무", "출근"].includes(normalized)) {
    return { isScheduled: true, reasonCode: null };
  }

  return { isScheduled: false, reasonCode: "not_scheduled" };
}

function parseShiftType(value: string | undefined): ShiftType {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["late", "late shift", "늦조", "exempt", "야간"].includes(normalized) ? "late" : "day";
}

function parseLunchFlag(value: string | undefined, fallback: boolean = false): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "y", "yes", "o", "ok", "allowed", "allow", "점심", "가능", "lunch"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "n", "no", "x", "blocked", "불가", "제외"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function buildKnownUserMap(users: RosterSyncUser[]) {
  const map = new Map<string, RosterSyncUser>();

  for (const user of users) {
    map.set(normalizeName(user.username), user);
    map.set(normalizeName(user.displayName), user);
  }

  return map;
}

function buildSimpleDefaultAssignments(
  targetDate: string,
  users: RosterSyncUser[],
  reasonCode: RosterReasonCode | null = null,
): SheetRosterAssignment[] {
  return users.map((user) => ({
    sourceKey: encodeRosterSourceKey(null, reasonCode),
    workDate: targetDate,
    username: user.username,
    matchedName: null,
    isScheduled: false,
    shiftType: "day",
    allowLunchOut: false,
    scheduleReasonCode: reasonCode,
    scheduleReason: reasonCode ? getRosterReasonMessage(reasonCode) : null,
  }));
}

function getTargetYear(targetDate: string): number {
  return Number(targetDate.slice(0, 4));
}

function getTargetMonthTitle(targetDate: string): string {
  return `${Number(targetDate.slice(5, 7))}월`;
}

function isWeekendOrHoliday(weekdayCell: string, primaryCell: string): boolean {
  return ["토", "일"].includes(weekdayCell.trim()) || /휴일|공휴일/.test(primaryCell);
}

async function createSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: getRequiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
      private_key: getRequiredEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n").replace(/^"|"$/g, ""),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  return google.sheets({ version: "v4", auth });
}

async function listSheetTitles(sheets: ReturnType<typeof google.sheets>, spreadsheetId: string): Promise<string[]> {
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });

  return (response.data.sheets ?? [])
    .map((sheet) => sheet.properties?.title?.trim())
    .filter((title): title is string => Boolean(title));
}

async function fetchLegacyRosterSnapshot(input: {
  sheets: ReturnType<typeof google.sheets>;
  spreadsheetId: string;
  targetDate: string;
  knownUsers: RosterSyncUser[];
}): Promise<SheetRosterSnapshot> {
  const response = await input.sheets.spreadsheets.values.get({
    spreadsheetId: input.spreadsheetId,
    range: "늦조인원!A:M",
  });

  const values = response.data.values ?? [];
  const dataRows = values.slice(2);
  const todayRow = dataRows.find((row) => normalizeDateValue(String(row[1] ?? ""), getTargetYear(input.targetDate)) === input.targetDate) ?? null;

  const lateNames = new Set<string>();
  const leaveNames = new Set<string>();
  const exceptionNames = new Set<string>();
  const rawReferencedNames = new Set<string>();

  if (todayRow) {
    for (let index = 2; index <= 9; index += 1) {
      const rawName = cleanName(String(todayRow[index] ?? ""));
      if (!rawName) {
        continue;
      }

      lateNames.add(normalizeName(rawName));
      rawReferencedNames.add(rawName);
    }

    for (const columnIndex of [10, 11, 12]) {
      for (const rawName of splitNames(todayRow[columnIndex])) {
        exceptionNames.add(normalizeName(rawName));
        rawReferencedNames.add(rawName);
      }
    }

    for (const rawName of splitNames(todayRow[10])) {
      leaveNames.add(normalizeName(rawName));
    }
  }

  const knownUserMap = buildKnownUserMap(input.knownUsers);
  const unmatchedNames = [...rawReferencedNames].filter((rawName) => !knownUserMap.has(normalizeName(rawName)));
  const assignments = input.knownUsers.map((user) => {
    const usernameKey = normalizeName(user.username);
    const displayNameKey = normalizeName(user.displayName);
    const isLate = lateNames.has(usernameKey) || lateNames.has(displayNameKey);
    const isLeave = leaveNames.has(usernameKey) || leaveNames.has(displayNameKey);
    const isException = exceptionNames.has(usernameKey) || exceptionNames.has(displayNameKey);

    return {
      sourceKey: encodeRosterSourceKey(`legacy:${input.targetDate}:${user.username}`, isLeave ? "leave" : null),
      workDate: input.targetDate,
      username: user.username,
      matchedName: user.displayName,
      isScheduled: !isLeave,
      shiftType: isLate ? "late" : "day",
      allowLunchOut: false,
      scheduleReasonCode: isLeave ? "leave" : null,
      scheduleReason: isLeave ? getRosterReasonMessage("leave") : null,
    } satisfies SheetRosterAssignment;
  });

  return {
    mode: "legacy_gas",
    workDate: input.targetDate,
    assignments,
    unmatchedNames,
  };
}

async function fetchMonthlyMatrixSnapshot(input: {
  sheets: ReturnType<typeof google.sheets>;
  spreadsheetId: string;
  targetDate: string;
  knownUsers: RosterSyncUser[];
}): Promise<SheetRosterSnapshot> {
  const monthTitle = getTargetMonthTitle(input.targetDate);
  const response = await input.sheets.spreadsheets.values.get({
    spreadsheetId: input.spreadsheetId,
    range: `${monthTitle}!B:L`,
  });
  const values = response.data.values ?? [];
  const targetYear = getTargetYear(input.targetDate);
  const knownUserMap = buildKnownUserMap(input.knownUsers);

  const rowIndex = values.findIndex((row, index) => {
    if (index === 0) {
      return false;
    }
    return normalizeDateValue(String(row[0] ?? ""), targetYear) === input.targetDate;
  });

  if (rowIndex < 0) {
      return {
        mode: "monthly_matrix",
        workDate: input.targetDate,
        assignments: buildSimpleDefaultAssignments(input.targetDate, input.knownUsers, "sheet_missing"),
        unmatchedNames: [],
      };
  }

  const row = values[rowIndex];
  const weekday = String(row[1] ?? "").trim();
  const explicitShiftNames = row.slice(2, 10).map((cell) => cleanName(String(cell ?? ""))).filter(Boolean);
  const specialCaseEntries = parseMonthlyMatrixSpecialCases(row[10]);
  const noteNames = specialCaseEntries.map((entry) => entry.name);
  const rawReferencedNames = new Set<string>([...explicitShiftNames, ...noteNames]);

  const explicitShiftSet = new Set(explicitShiftNames.map((name) => normalizeName(name)));
  const specialCaseMap = new Map(
    specialCaseEntries.map((entry) => [normalizeName(entry.name), { reasonCode: entry.reasonCode, reasonMessage: entry.reasonMessage }]),
  );
  const weekendOrHoliday = isWeekendOrHoliday(weekday, String(row[2] ?? "").trim());

  const unmatchedNames = [...rawReferencedNames].filter((name) => !knownUserMap.has(normalizeName(name)));

  const assignments = input.knownUsers.map((user) => {
    const keys = [normalizeName(user.username), normalizeName(user.displayName)];
    const specialCase = keys.map((key) => specialCaseMap.get(key)).find(Boolean) ?? null;
    const isExplicit = keys.some((key) => explicitShiftSet.has(key));

    if (weekendOrHoliday) {
        return {
          sourceKey: encodeRosterSourceKey(`${monthTitle}:${rowIndex + 1}:${user.username}`, isExplicit ? null : "holiday"),
          workDate: input.targetDate,
          username: user.username,
          matchedName: isExplicit ? user.displayName : null,
          isScheduled: isExplicit,
          shiftType: "day",
          allowLunchOut: false,
          scheduleReasonCode: isExplicit ? null : "holiday",
          scheduleReason: isExplicit ? null : getRosterReasonMessage("holiday"),
        } satisfies SheetRosterAssignment;
      }

      if (specialCase) {
        return {
          sourceKey: encodeRosterSourceKey(`${monthTitle}:${rowIndex + 1}:${user.username}`, specialCase.reasonCode),
          workDate: input.targetDate,
          username: user.username,
          matchedName: user.displayName,
          isScheduled: false,
          shiftType: "day",
          allowLunchOut: false,
          scheduleReasonCode: specialCase.reasonCode,
          scheduleReason: specialCase.reasonMessage,
        } satisfies SheetRosterAssignment;
      }

    if (isExplicit) {
        return {
          sourceKey: encodeRosterSourceKey(`${monthTitle}:${rowIndex + 1}:${user.username}`, null),
          workDate: input.targetDate,
          username: user.username,
          matchedName: user.displayName,
          isScheduled: true,
          shiftType: "late",
          allowLunchOut: false,
          scheduleReasonCode: null,
          scheduleReason: null,
        } satisfies SheetRosterAssignment;
      }

      return {
        sourceKey: encodeRosterSourceKey(`${monthTitle}:${rowIndex + 1}:${user.username}`, null),
        workDate: input.targetDate,
        username: user.username,
        matchedName: user.displayName,
        isScheduled: true,
        shiftType: "day",
        allowLunchOut: false,
        scheduleReasonCode: null,
        scheduleReason: null,
      } satisfies SheetRosterAssignment;
    });

  return {
    mode: "monthly_matrix",
    workDate: input.targetDate,
    assignments,
    unmatchedNames,
  };
}

async function fetchSimpleRosterSnapshot(input: {
  sheets: ReturnType<typeof google.sheets>;
  spreadsheetId: string;
  targetDate: string;
  knownUsers: RosterSyncUser[];
}): Promise<SheetRosterSnapshot> {
  const range = `${process.env.GOOGLE_SHEET_TAB_NAME ?? "Roster"}!A:Z`;
  const response = await input.sheets.spreadsheets.values.get({
    spreadsheetId: input.spreadsheetId,
    range,
  });
  const values = response.data.values ?? [];

  if (values.length === 0) {
      return {
        mode: "simple_table",
        workDate: input.targetDate,
        assignments: buildSimpleDefaultAssignments(input.targetDate, input.knownUsers, "sheet_missing"),
        unmatchedNames: [],
      };
  }

  const [headerRow, ...dataRows] = values;
  const normalizedHeaders = headerRow.map((cell) => normalizeHeader(String(cell ?? "")));
  const dateIndex = normalizedHeaders.findIndex((header) => header === "date" || header === "workdate");
  const nameIndex = normalizedHeaders.findIndex((header) => header === "name" || header === "displayname" || header === "username");
  const scheduledIndex = normalizedHeaders.findIndex((header) => header === "scheduled" || header === "isscheduled" || header === "status");
  const shiftIndex = normalizedHeaders.findIndex((header) => header === "shifttype" || header === "shift" || header === "조" || header === "근무조");
  const lunchIndex = normalizedHeaders.findIndex((header) => header === "allowlunchout" || header === "lunchout" || header === "lunch" || header === "점심" || header === "점심출입");

  if (dateIndex < 0 || nameIndex < 0) {
    throw new Error("Google Sheet must include date and name columns.");
  }

  const knownUserMap = buildKnownUserMap(input.knownUsers);
  const unmatchedNames = new Set<string>();
  const assignmentMap = new Map<string, SheetRosterAssignment>();

  dataRows.forEach((row, index) => {
    const date = normalizeDateValue(String(row[dateIndex] ?? ""), getTargetYear(input.targetDate));
    const name = cleanName(String(row[nameIndex] ?? ""));

    if (!date || date !== input.targetDate || !name) {
      return;
    }

    const matchedUser = knownUserMap.get(normalizeName(name));
    if (!matchedUser) {
      unmatchedNames.add(name);
      return;
    }

    const scheduledInfo = parseScheduledInfo(scheduledIndex >= 0 ? String(row[scheduledIndex] ?? "") : undefined);

    assignmentMap.set(matchedUser.username, {
      sourceKey: encodeRosterSourceKey(`${input.targetDate}:${index + 2}:${name}`, scheduledInfo.reasonCode),
      workDate: input.targetDate,
      username: matchedUser.username,
      matchedName: name,
      isScheduled: scheduledInfo.isScheduled,
      shiftType: parseShiftType(shiftIndex >= 0 ? String(row[shiftIndex] ?? "") : undefined),
      allowLunchOut: parseLunchFlag(lunchIndex >= 0 ? String(row[lunchIndex] ?? "") : undefined, false),
      scheduleReasonCode: scheduledInfo.reasonCode,
      scheduleReason: scheduledInfo.reasonCode ? getRosterReasonMessage(scheduledInfo.reasonCode) : null,
    });
  });

  const assignments = input.knownUsers.map(
    (user) =>
      assignmentMap.get(user.username) ??
      ({
        sourceKey: encodeRosterSourceKey(null, "not_listed"),
        workDate: input.targetDate,
        username: user.username,
        matchedName: null,
        isScheduled: false,
        shiftType: "day",
        allowLunchOut: false,
        scheduleReasonCode: "not_listed",
        scheduleReason: getRosterReasonMessage("not_listed"),
      } satisfies SheetRosterAssignment),
  );

  return {
    mode: "simple_table",
    workDate: input.targetDate,
    assignments,
    unmatchedNames: [...unmatchedNames],
  };
}

async function fetchLegacyUserCandidates(input: {
  sheets: ReturnType<typeof google.sheets>;
  spreadsheetId: string;
}): Promise<SheetUserCandidateSnapshot> {
  const response = await input.sheets.spreadsheets.values.get({
    spreadsheetId: input.spreadsheetId,
    range: "늦조인원!A:M",
  });

  const values = response.data.values ?? [];
  const names: string[] = [];

  for (const row of values.slice(2)) {
    names.push(...extractCandidateNamesFromCells([...row.slice(2, 13)]));
  }

  return {
    mode: "legacy_gas",
    names: buildUniqueSortedNames(names),
  };
}

async function fetchMonthlyMatrixUserCandidates(input: {
  sheets: ReturnType<typeof google.sheets>;
  spreadsheetId: string;
  titles: string[];
  targetDate?: string;
}): Promise<SheetUserCandidateSnapshot> {
  const monthTitles = input.titles.filter((title) => monthTitlePattern.test(title));

  if (monthTitles.length === 0) {
    return {
      mode: "monthly_matrix",
      names: [],
    };
  }

  const targetMonthTitle = getTargetMonthTitle(input.targetDate ?? getKoreaDateKey());
  const sourceMonthTitle = monthTitles.includes(targetMonthTitle) ? targetMonthTitle : monthTitles[monthTitles.length - 1];
  const response = await input.sheets.spreadsheets.values.get({
    spreadsheetId: input.spreadsheetId,
    range: `${sourceMonthTitle}!B:L`,
  });

  const values = response.data.values ?? [];
  const fallbackYear = Number((input.targetDate ?? getKoreaDateKey()).slice(0, 4));
  const names: string[] = [];

  for (const row of values.slice(1)) {
    const hasWorkDate = Boolean(normalizeDateValue(String(row[0] ?? ""), fallbackYear));

    if (!hasWorkDate) {
      continue;
    }

    names.push(...extractCandidateNamesFromCells([...row.slice(2, 10), row[10]]));
  }

  return {
    mode: "monthly_matrix",
    names: buildUniqueSortedNames(names),
  };
}

async function fetchSimpleUserCandidates(input: {
  sheets: ReturnType<typeof google.sheets>;
  spreadsheetId: string;
}): Promise<SheetUserCandidateSnapshot> {
  const range = `${process.env.GOOGLE_SHEET_TAB_NAME ?? "Roster"}!A:Z`;
  const response = await input.sheets.spreadsheets.values.get({
    spreadsheetId: input.spreadsheetId,
    range,
  });
  const values = response.data.values ?? [];

  if (values.length === 0) {
    return {
      mode: "simple_table",
      names: [],
    };
  }

  const [headerRow, ...dataRows] = values;
  const normalizedHeaders = headerRow.map((cell) => normalizeHeader(String(cell ?? "")));
  const nameIndex = normalizedHeaders.findIndex((header) => header === "name" || header === "displayname" || header === "username");

  if (nameIndex < 0) {
    throw new Error("Google Sheet must include a name column.");
  }

  return {
    mode: "simple_table",
    names: buildUniqueSortedNames(
      dataRows.map((row) => cleanName(String(row[nameIndex] ?? ""))).filter((name) => isPotentialPersonName(name)),
    ),
  };
}

export async function fetchSheetRosterSnapshot(
  targetDate: string = getKoreaDateKey(),
  knownUsers: RosterSyncUser[] = [],
): Promise<SheetRosterSnapshot> {
  const sheets = await createSheetsClient();
  const spreadsheetId = getRequiredEnv("GOOGLE_SHEET_ID");
  const titles = await listSheetTitles(sheets, spreadsheetId);
  const monthTitle = getTargetMonthTitle(targetDate);

  if (titles.includes("늦조인원")) {
    return fetchLegacyRosterSnapshot({
      sheets,
      spreadsheetId,
      targetDate,
      knownUsers,
    });
  }

  if (titles.includes(monthTitle)) {
    return fetchMonthlyMatrixSnapshot({
      sheets,
      spreadsheetId,
      targetDate,
      knownUsers,
    });
  }

  return fetchSimpleRosterSnapshot({
    sheets,
    spreadsheetId,
    targetDate,
    knownUsers,
  });
}

export async function fetchSheetUserCandidates(): Promise<SheetUserCandidateSnapshot> {
  const sheets = await createSheetsClient();
  const spreadsheetId = getRequiredEnv("GOOGLE_SHEET_ID");
  const titles = await listSheetTitles(sheets, spreadsheetId);

  if (titles.includes("늦조인원")) {
    return fetchLegacyUserCandidates({
      sheets,
      spreadsheetId,
    });
  }

  if (titles.some((title) => monthTitlePattern.test(title))) {
    return fetchMonthlyMatrixUserCandidates({
      sheets,
      spreadsheetId,
      titles,
    });
  }

  return fetchSimpleUserCandidates({
    sheets,
    spreadsheetId,
  });
}






