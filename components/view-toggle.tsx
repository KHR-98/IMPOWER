"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function ViewToggle() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isUserView = pathname === "/dashboard" && searchParams.get("view") === "user";

  return (
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
  );
}
