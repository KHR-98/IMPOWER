// Reversible department lock.
//
// Accounts whose department code is listed here are blocked from using the web
// app entirely (new logins and already-issued sessions). This does NOT remove
// any department feature or logic — it only locks access. To unlock a
// department, remove its code from this set.
const LOCKED_DEPARTMENT_CODES = new Set<string>(["memory"]);

export const DEPARTMENT_LOCKED_MESSAGE = "메모리 부서는 현재 이용할 수 없습니다. 관리자에게 문의하세요.";

export function isDepartmentLocked(departmentCode?: string | null): boolean {
  return !!departmentCode && LOCKED_DEPARTMENT_CODES.has(departmentCode);
}
