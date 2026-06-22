import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { fetchGoogleHolidays } from "@/lib/korean-holidays-api";
import { getSupabaseAdminClient } from "@/lib/supabase";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "master") {
    return NextResponse.json({ error: "마스터 계정만 공휴일을 동기화할 수 있습니다." }, { status: 403 });
  }

  const { year } = await req.json();
  const targetYear = Number(year);
  if (!targetYear || targetYear < 2020 || targetYear > 2100) {
    return NextResponse.json({ error: "올바른 연도를 입력하세요." }, { status: 400 });
  }

  const holidays = await fetchGoogleHolidays(targetYear);

  const rows = holidays.map((h) => ({
    date: h.date,
    name: h.name,
    year: targetYear,
    synced_at: new Date().toISOString(),
  }));

  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("korean_holidays")
    .upsert(rows, { onConflict: "date" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ synced: rows.length, year: targetYear });
}
