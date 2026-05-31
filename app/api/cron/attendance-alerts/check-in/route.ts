import { NextRequest, NextResponse } from "next/server";

import { sendAttendanceStatusAlert } from "@/lib/attendance-alerts";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await sendAttendanceStatusAlert("check-in");

  if (!result.ok) {
    return NextResponse.json(
      { error: "Telegram attendance alert failed.", telegram: result.telegram, report: result.report },
      { status: 502 },
    );
  }

  return NextResponse.json(result);
}
