import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchGoogleHolidays } from "@/lib/korean-holidays-api";

export async function loadHolidayMap(supabase: SupabaseClient, year: number): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("korean_holidays")
    .select("date, name")
    .eq("year", year);

  if (data && data.length > 0) {
    return new Map(data.map((r: { date: string; name: string }) => [r.date, r.name]));
  }

  // Supabase에 해당 연도 데이터 없으면 Google Calendar에서 자동 fetch 후 저장
  const holidays = await fetchGoogleHolidays(year);

  if (holidays.length > 0) {
    await supabase.from("korean_holidays").upsert(
      holidays.map((h) => ({
        date: h.date,
        name: h.name,
        year,
        synced_at: new Date().toISOString(),
      })),
      { onConflict: "date" },
    );
  }

  return new Map(holidays.map((h) => [h.date, h.name]));
}
