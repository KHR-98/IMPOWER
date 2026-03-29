"use server";

import { redirect } from "next/navigation";

import { clearSession } from "@/lib/auth";

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}
