import type { Department, DepartmentAttendanceSettings } from "@/lib/types";

/**
 * Frontend-only department overrides.
 *
 * These transforms adjust ONLY the department lists surfaced to the UI. They do
 * not touch the database, roster sheets, or any server-side attendance logic
 * (which key off department `code` strings directly). Purpose:
 *   - Surface two placeholder departments (ITC, 인프라) in every admin
 *     department-button location, without a real backend department.
 *   - Hide the 메모리 department from the frontend (not removed from data).
 *
 * Because ITC/인프라 have no backing department row, write actions targeting
 * them (assigning a user, saving settings) will not persist — this is inherent
 * to a frontend-only placeholder and is expected.
 */

const HIDDEN_DEPARTMENT_CODES = new Set<string>(["memory"]);

const FRONTEND_ONLY_DEPARTMENTS: readonly Department[] = [
  { id: "fe-itc", code: "itc", name: "ITC", isActive: true },
  { id: "fe-infra", code: "infra", name: "인프라", isActive: true },
] as const;

function isHidden(code: string): boolean {
  return HIDDEN_DEPARTMENT_CODES.has(code);
}

/** Remove hidden departments, then append the frontend-only placeholders. */
export function applyDepartmentOverrides(departments: Department[]): Department[] {
  const visible = departments.filter((department) => !isHidden(department.code));
  const existingCodes = new Set(visible.map((department) => department.code));
  const additions = FRONTEND_ONLY_DEPARTMENTS.filter(
    (department) => !existingCodes.has(department.code),
  );
  return [...visible, ...additions];
}

/**
 * Same visibility rules for the settings-panel department list. The placeholder
 * departments reuse an existing department's shift windows as a template so the
 * settings UI has a valid shape to render; if no template exists they are
 * skipped (nothing to clone from).
 */
export function applyDepartmentSettingsOverrides(
  departmentSettings: DepartmentAttendanceSettings[],
): DepartmentAttendanceSettings[] {
  const visible = departmentSettings.filter((department) => !isHidden(department.code));
  const template = visible[0] ?? null;
  if (!template) {
    return visible;
  }

  const existingCodes = new Set(visible.map((department) => department.code));
  const additions = FRONTEND_ONLY_DEPARTMENTS.filter(
    (department) => !existingCodes.has(department.code),
  ).map((department) => ({
    ...structuredClone(template),
    id: department.id,
    code: department.code,
    name: department.name,
    isActive: department.isActive,
  }));

  return [...visible, ...additions];
}
