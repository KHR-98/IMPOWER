import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { canViewAdmin } from "@/lib/permissions";

export default async function IndexPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  redirect(canViewAdmin(session.role) ? "/admin" : "/dashboard");
}
