import Link from "next/link";
import { Suspense } from "react";

import { ViewToggle } from "@/components/view-toggle";
import { requireSession } from "@/lib/auth";

import { logoutAction } from "./actions";

const SITE_NAV_ITEMS = [
  { label: "메모리PCS", href: "#" },
  { label: "파운드리PCS", href: "#" },
  { label: "메모리", href: "#" },
] as const;

const LogoutIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireSession();
  const isAdmin = session.role === "admin" || session.role === "sub_admin";

  return (
    <div className="shell">
      <div className="container">
        <header className="topbar">
          <div className="brand">
            <span className="brand-kicker">아임파워(주)</span>
            <span className="brand-title">IM-ON</span>
          </div>
          {isAdmin ? (
            <nav className="topbar-site-nav" aria-label="사이트 전환">
              {SITE_NAV_ITEMS.map((item) => (
                <Link key={item.label} href={item.href} className="topbar-site-link">
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : null}
        </header>

        <div className="view-toggle-fixed">
          {isAdmin ? (
            <Suspense>
              <ViewToggle />
            </Suspense>
          ) : null}
          <form action={logoutAction}>
            <button type="submit" className="button-ghost logout-icon-btn" aria-label="로그아웃" title="로그아웃">
              <LogoutIcon />
            </button>
          </form>
        </div>

        {children}
      </div>
    </div>
  );
}
