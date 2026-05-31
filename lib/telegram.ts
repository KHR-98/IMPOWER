import "server-only";

import { getTelegramAlertConfig, type TelegramAlertConfig } from "@/lib/env";

export type TelegramAlertSkipReason = "disabled" | "missing-config" | "empty-message";

export type TelegramAlertSendResult =
  | { ok: true; skipped: false }
  | { ok: true; skipped: true; reason: TelegramAlertSkipReason }
  | { ok: false; skipped: false; status?: number; error: string };

export interface SendTelegramMessageInput {
  text: string;
  config?: TelegramAlertConfig;
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

interface TelegramApiResponse {
  ok?: boolean;
  description?: string;
}

export function isTelegramAlertConfigured(config: TelegramAlertConfig = getTelegramAlertConfig()): boolean {
  return config.alertsEnabled && Boolean(config.botToken && config.chatId);
}

function parseMessageThreadId(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function readTelegramResponse(response: Response): Promise<TelegramApiResponse | null> {
  try {
    const payload: unknown = await response.json();

    if (!payload || typeof payload !== "object") {
      return null;
    }

    const candidate = payload as { ok?: unknown; description?: unknown };
    return {
      ok: typeof candidate.ok === "boolean" ? candidate.ok : undefined,
      description: typeof candidate.description === "string" ? candidate.description : undefined,
    };
  } catch {
    return null;
  }
}

export async function sendTelegramMessage(input: SendTelegramMessageInput): Promise<TelegramAlertSendResult> {
  const text = input.text.trim();

  if (!text) {
    return { ok: true, skipped: true, reason: "empty-message" };
  }

  const config = input.config ?? getTelegramAlertConfig();

  if (!config.alertsEnabled) {
    return { ok: true, skipped: true, reason: "disabled" };
  }

  if (!config.botToken || !config.chatId) {
    return { ok: true, skipped: true, reason: "missing-config" };
  }

  const body: Record<string, string | number> = {
    chat_id: config.chatId,
    text,
  };
  const messageThreadId = parseMessageThreadId(config.messageThreadId);

  if (messageThreadId) {
    body.message_thread_id = messageThreadId;
  }

  try {
    const fetchImpl = input.fetchImpl ?? fetch;
    const response = await fetchImpl(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const telegramResponse = await readTelegramResponse(response);

    if (!response.ok || telegramResponse?.ok === false) {
      return {
        ok: false,
        skipped: false,
        status: response.status,
        error: telegramResponse?.description ?? `Telegram API request failed with status ${response.status}`,
      };
    }

    return { ok: true, skipped: false };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
