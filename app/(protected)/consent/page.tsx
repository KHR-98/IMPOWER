import { redirect } from "next/navigation";

import { ConsentForm } from "@/components/consent-form";
import { requireSession } from "@/lib/auth";
import { canViewAdmin } from "@/lib/permissions";
import { hasCurrentConsent } from "@/lib/consent-store";
import type { UserRole } from "@/lib/types";

function getDefaultNextPath(role: UserRole): string {
  return canViewAdmin(role) ? "/admin" : "/dashboard";
}

function sanitizeNextPath(rawNext: string | undefined, defaultPath: string): string {
  if (!rawNext || !rawNext.startsWith("/") || rawNext.startsWith("//")) {
    return defaultPath;
  }

  if (rawNext.startsWith("/api/") || rawNext === "/login" || rawNext === "/consent") {
    return defaultPath;
  }

  return rawNext;
}

export default async function ConsentPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const session = await requireSession();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const defaultNextPath = getDefaultNextPath(session.role);
  const nextPath = sanitizeNextPath(resolvedSearchParams?.next, defaultNextPath);

  if (await hasCurrentConsent(session.username)) {
    redirect(nextPath);
  }

  return <ConsentForm nextPath={nextPath} defaultName={session.displayName} />;
}
