import type { UserRole } from "@/lib/types";

export function isAdminRole(role: UserRole): boolean {
  return role === "master" || role === "admin" || role === "sub_admin";
}

export function isSystemAdminRole(role: UserRole): boolean {
  return role === "master" || role === "admin";
}

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case "master":
      return "마스터";
    case "admin":
      return "관리자";
    case "sub_admin":
      return "부서장";
    default:
      return "일반";
  }
}
