import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("classifies explicit monthly matrix workers on weekends as weekend shift", () => {
  const source = readFileSync("lib/google-sheets.ts", "utf8");
  const weekendBranch = source.match(/if \(weekendOrHoliday\) \{[\s\S]*?\n      \}/)?.[0] ?? "";

  expect(weekendBranch).toContain('shiftType: isExplicit ? "weekend" : "day"');
});
