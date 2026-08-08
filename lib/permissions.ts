import type { UserRole } from "@/lib/types";

export function isAdminRole(role: UserRole): boolean {
  return role === "master" || role === "admin" || role === "sub_admin";
}

export function isSystemAdminRole(role: UserRole): boolean {
  return role === "master" || role === "admin";
}

// 관리자 화면을 "볼 수 있는" 역할. 쓰기 권한과 분리한다: viewer는 열람만 가능하고
// 실제 변경은 isAdminRole/isSystemAdminRole 게이트가 계속 막는다.
export function canViewAdmin(role: UserRole): boolean {
  return isAdminRole(role) || role === "viewer";
}

// 전체 부서를 자유롭게 선택/조회할 수 있는 역할(오늘현황·명단복사·엑셀). master와 viewer만.
export function canSelectAnyDepartment(role: UserRole): boolean {
  return role === "master" || role === "viewer";
}

export function getRoleLabel(role: UserRole): string {
  switch (role) {
    case "master":
      return "마스터";
    case "admin":
      return "팀장";
    case "sub_admin":
      return "조장";
    case "viewer":
      return "운영";
    default:
      return "대원";
  }
}
