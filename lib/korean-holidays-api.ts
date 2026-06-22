import "server-only";

import { google } from "googleapis";

import { getRequiredEnv } from "@/lib/env";

const CALENDAR_ID = "ko.south_korea#holiday@group.v.calendar.google.com";

export async function fetchGoogleHolidays(year: number): Promise<Array<{ date: string; name: string }>> {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: getRequiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
      private_key: getRequiredEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n").replace(/^"|"$/g, ""),
    },
    scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  });

  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: `${year}-01-01T00:00:00Z`,
    timeMax: `${year}-12-31T23:59:59Z`,
    singleEvents: true,
    maxResults: 100,
  });

  return (res.data.items ?? [])
    .filter((e) => e.start?.date)
    .map((e) => {
      const raw = e.summary ?? "";
      const name = raw.includes("대체") ? "대체공휴일" : raw;
      return { date: e.start!.date!, name };
    });
}
