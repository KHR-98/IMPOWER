import { buildAlertMessage, sendAlert } from "@/lib/alerts";
import { isTelegramAlertConfigured, sendTelegramMessage } from "@/lib/telegram";

const alertText = buildAlertMessage({
  title: "Attendance Alert",
  message: "Alert API smoke check",
  lines: ["Trigger conditions will be connected later"],
});
const typedAlertText: string = alertText;

const configured: boolean = isTelegramAlertConfigured({
  alertsEnabled: true,
  botToken: "token",
  chatId: "chat-id",
  messageThreadId: null,
});

async function verifyTelegramAlertApi() {
  await sendTelegramMessage({
    text: alertText,
    config: {
      alertsEnabled: true,
      botToken: "token",
      chatId: "chat-id",
      messageThreadId: null,
    },
    fetchImpl: async () =>
      new Response(JSON.stringify({ ok: true, result: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  });

  await sendAlert(
    {
      title: "Attendance Alert",
      message: "Common alert API smoke check",
    },
    {
      config: {
        alertsEnabled: false,
        botToken: null,
        chatId: null,
        messageThreadId: null,
      },
    },
  );
}

void typedAlertText;
void configured;
void verifyTelegramAlertApi;
