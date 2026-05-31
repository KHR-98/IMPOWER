import "server-only";

export interface TelegramAlertConfig {
  alertsEnabled: boolean;
  botToken: string | null;
  chatId: string | null;
  messageThreadId: string | null;
}

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false;
  }

  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
    return true;
  }

  return defaultValue;
}

function getOptionalTrimmedEnv(...names: string[]): string | null {
  const value = getOptionalEnv(...names)?.trim();
  return value ? value : null;
}

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

export function getTelegramAlertConfig(): TelegramAlertConfig {
  return {
    alertsEnabled: parseBooleanEnv(process.env.TELEGRAM_ALERTS_ENABLED, true),
    botToken: getOptionalTrimmedEnv("TELEGRAM_BOT_TOKEN"),
    chatId: getOptionalTrimmedEnv("TELEGRAM_CHAT_ID"),
    messageThreadId: getOptionalTrimmedEnv("TELEGRAM_MESSAGE_THREAD_ID", "TELEGRAM_THREAD_ID"),
  };
}
