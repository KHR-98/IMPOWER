import "server-only";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";

import { buildConsentTextForHash, CONSENT_VERSION, type ConsentItemValues } from "@/lib/consent-copy";
import { hasSupabaseEnv } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabase";

const CONSENT_TABLE = "app_consent_records";
const DEMO_CONSENT_COOKIE_NAME = "im_on_demo_consent";

export function getConsentTextHash(): string {
  return createHash("sha256").update(buildConsentTextForHash()).digest("hex");
}

function getDemoConsentCookieValue(username: string): string {
  return `${username}:${CONSENT_VERSION}:${getConsentTextHash()}`;
}

export async function hasCurrentConsent(username: string): Promise<boolean> {
  if (!hasSupabaseEnv()) {
    const store = await cookies();
    return store.get(DEMO_CONSENT_COOKIE_NAME)?.value === getDemoConsentCookieValue(username);
  }

  const client = getSupabaseAdminClient();
  const { data: user, error: userError } = await client
    .from("account_users")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (userError) {
    throw userError;
  }

  if (!user) {
    return false;
  }

  const { data, error } = await client
    .from(CONSENT_TABLE)
    .select("id")
    .eq("user_id", user.id)
    .eq("consent_version", CONSENT_VERSION)
    .eq("consent_text_hash", getConsentTextHash())
    .eq("agreed_personal_info", true)
    .eq("agreed_location", true)
    .eq("agreed_camera_policy_check", true)
    .eq("agreed_cloud_processing", true)
    .eq("agreed_refusal_manual_procedure", true)
    .eq("agreed_e_signature_log", true)
    .not("signed_name", "is", null)
    .neq("signed_name", "")
    .order("consented_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function saveConsentRecord(input: {
  username: string;
  signedName: string;
  userAgent: string | null;
  ipAddress: string | null;
  items: ConsentItemValues;
}): Promise<void> {
  if (!hasSupabaseEnv()) {
    const store = await cookies();
    store.set(DEMO_CONSENT_COOKIE_NAME, getDemoConsentCookieValue(input.username), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return;
  }

  const client = getSupabaseAdminClient();
  const { data: user, error: userError } = await client
    .from("account_users")
    .select("id")
    .eq("username", input.username)
    .maybeSingle();

  if (userError) {
    throw userError;
  }

  if (!user) {
    throw new Error("Consent target user not found.");
  }

  const { error } = await client.from(CONSENT_TABLE).insert({
    user_id: user.id,
    username: input.username,
    consent_version: CONSENT_VERSION,
    consent_text_hash: getConsentTextHash(),
    signed_name: input.signedName.trim(),
    user_agent: input.userAgent,
    ip_address: input.ipAddress,
    agreed_personal_info: input.items.personalInfo,
    agreed_location: input.items.locationInfo,
    agreed_camera_policy_check: input.items.cameraPolicyCheck,
    agreed_cloud_processing: input.items.cloudProcessing,
    agreed_refusal_manual_procedure: input.items.refusalManualFallback,
    agreed_e_signature_log: input.items.signatureLogStorage,
  });

  if (error) {
    throw error;
  }
}
