"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const DEPARTMENTS = [
  { code: "memory_pcs", name: "메모리PCS" },
  { code: "foundry_pcs", name: "파운드리PCS" },
  { code: "memory", name: "메모리" },
];

export function ViewToggle() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isUserView = pathname === "/dashboard" && searchParams.get("view") === "user";
  const section = searchParams.get("section");
  const selectedDept = searchParams.get("dept");

  function adminHref(dept: string | null) {
    const params = new URLSearchParams();
    if (section) params.set("section", section);
    if (dept) params.set("dept", dept);
    const qs = params.toString();
    return qs ? `/admin?${qs}` : "/admin";
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
      <div className="view-toggle">
        <Link
          href="/dashboard?view=user"
          className={`view-toggle-option${isUserView ? " view-toggle-option-active" : ""}`}
        >
          사용자
        </Link>
        <Link
          href="/admin"
          className={`view-toggle-option${!isUserView ? " view-toggle-option-active" : ""}`}
        >
          관리자
        </Link>
      </div>
      {!isUserView ? (
        <div className="view-toggle view-toggle-sm">
          {DEPARTMENTS.map((dept) => (
            <Link
              key={dept.code}
              href={adminHref(selectedDept === dept.code ? null : dept.code)}
              className={`view-toggle-option${selectedDept === dept.code ? " view-toggle-option-active" : ""}`}
            >
              {dept.name}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
