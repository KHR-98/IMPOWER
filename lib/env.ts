import "server-only";

export function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getOptionalEnv(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name];

    if (value) {
      return value;
    }
  }

  return null;
}

export function getSupabaseServerKey(): string {
  const value = getOptionalEnv("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");

  if (!value) {
    throw new Error("Missing Supabase server key. Set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return value;
}

export function hasSupabaseEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && getOptionalEnv("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"));
}

export function hasGoogleSheetEnv(): boolean {
  const hasAnySheetId = Boolean(
    getOptionalEnv(
      "GOOGLE_SHEET_ID_MEMORY_PCS",
      "GOOGLE_SHEET_ID",
      "GOOGLE_SHEET_ID_MEMORY",
      "GOOGLE_SHEET_ID_FOUNDRY_PCS",
    ),
  );

  return Boolean(
    hasAnySheetId &&
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY,
  );
}
