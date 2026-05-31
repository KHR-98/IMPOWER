import "server-only";

import type { TelegramAlertConfig } from "@/lib/env";
import { sendTelegramMessage, type SendTelegramMessageInput, type TelegramAlertSendResult } from "@/lib/telegram";

export interface AlertMessageInput {
  title?: string;
  message: string;
  lines?: Array<string | null | undefined | false>;
}

export interface SendAlertOptions {
  config?: TelegramAlertConfig;
  fetchImpl?: SendTelegramMessageInput["fetchImpl"];
}

export function buildAlertMessage(input: AlertMessageInput): string {
  return [
    input.title,
    input.message,
    ...(input.lines ?? []),
  ]
    .filter((line): line is string => typeof line === "string")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

export async function sendAlert(input: AlertMessageInput, options: SendAlertOptions = {}): Promise<TelegramAlertSendResult> {
  return sendTelegramMessage({
    text: buildAlertMessage(input),
    config: options.config,
    fetchImpl: options.fetchImpl,
  });
}
