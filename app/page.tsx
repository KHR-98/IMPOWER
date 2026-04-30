import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/lib/permissions";

export default async function IndexPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  redirect(isAdminRole(session.role) ? "/admin" : "/dashboard");
}
