import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getRequiredEnv, getSupabaseServerKey } from "@/lib/env";

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
  if (adminClient) {
    return adminClient;
  }

  adminClient = createClient(getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"), getSupabaseServerKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return adminClient;
}
