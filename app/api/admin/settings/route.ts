import { NextResponse } from "next/server";
import { z } from "zod";

import { saveAdminConfiguration } from "@/lib/app-data";
import { buildOperationalSettings } from "@/lib/attendance-schedule";
import { getSession } from "@/lib/auth";
import { isSystemAdminRole } from "@/lib/permissions";

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const timeWindowSchema = z.object({
  start: z.string().regex(timePattern, "시간 형식은 HH:MM 이어야 합니다."),
  end: z.string().regex(timePattern, "시간 형식은 HH:MM 이어야 합니다."),
});

const shiftSettingsSchema = z.object({
  checkInWindow: timeWindowSchema,
  tbmMorningWindow: timeWindowSchema.nullable(),
  lunchOutWindow: timeWindowSchema.nullable(),
  lunchInWindow: timeWindowSchema.nullable(),
  tbmAfternoonWindow: timeWindowSchema.nullable(),
  tbmCheckoutWindow: timeWindowSchema.nullable(),
  checkOutWindow: timeWindowSchema,
  earlyCheckOutWindow: timeWindowSchema.nullable(),
});

const departmentSettingsSchema = z.object({
  id: z.string().uuid("부서 ID 형식이 올바르지 않습니다."),
  code: z.string().trim().min(1, "부서 코드가 필요합니다."),
  name: z.string().trim().min(1, "부서명이 필요합니다."),
  isActive: z.boolean(),
  dayShift: shiftSettingsSchema,
  lateShift: shiftSettingsSchema,
  weekendShift: shiftSettingsSchema.optional(),
});

const zoneSchema = z.object({
  id: z.string().trim().min(1, "지점 식별값이 필요합니다."),
  name: z.string().trim().min(1, "지점 이름을 입력하세요."),
  type: z.enum(["entry", "tbm"]),
  latitude: z.number().min(-90, "위도 범위를 확인하세요.").max(90, "위도 범위를 확인하세요."),
  longitude: z.number().min(-180, "경도 범위를 확인하세요.").max(180, "경도 범위를 확인하세요."),
  radiusM: z.number().int().min(10, "반경은 10m 이상이어야 합니다.").max(5000, "반경이 너무 큽니다."),
  isActive: z.boolean(),
});

const adminSettingsSchema = z
  .object({
    settings: z.object({
      checkInWindow: timeWindowSchema,
      tbmWindow: timeWindowSchema,
      tbmAfternoonWindow: timeWindowSchema,
      tbmCheckoutWindow: timeWindowSchema,
      checkOutWindow: timeWindowSchema,
      lateCheckInWindow: timeWindowSchema,
      lateCheckOutWindow: timeWindowSchema,
      departmentSettings: z.array(departmentSettingsSchema).optional().default([]),
      maxGpsAccuracyM: z.number().int().min(10, "GPS 정확도는 10m 이상이어야 합니다.").max(1000, "GPS 정확도는 1000m 이하이어야 합니다."),
    }),
    zones: z.array(zoneSchema).min(1, "지점은 최소 1개 이상 필요합니다."),
  })
  .superRefine((value, ctx) => {
    const windows = [
      ["출근", value.settings.checkInWindow],
      ["오전 TBM", value.settings.tbmWindow],
      ["오후 TBM", value.settings.tbmAfternoonWindow],
      ["퇴근 TBM", value.settings.tbmCheckoutWindow],
      ["퇴근", value.settings.checkOutWindow],
    ] as const;

    const departmentWindows = value.settings.departmentSettings.flatMap((department) => [
      [`${department.name} 주간 출근`, department.dayShift.checkInWindow],
      [`${department.name} 주간 오전 TBM`, department.dayShift.tbmMorningWindow],
      [`${department.name} 주간 오후 TBM`, department.dayShift.tbmAfternoonWindow],
      [`${department.name} 주간 퇴근 TBM`, department.dayShift.tbmCheckoutWindow],
      [`${department.name} 주간 퇴근`, department.dayShift.checkOutWindow],
      [`${department.name} 늦조 출근`, department.lateShift.checkInWindow],
      [`${department.name} 늦조 퇴근`, department.lateShift.checkOutWindow],
    ] as const);

    const weekendDepartmentWindows = value.settings.departmentSettings.flatMap((department) =>
      department.weekendShift
        ? ([
            [`${department.name} 주말 출근`, department.weekendShift.checkInWindow],
            [`${department.name} 주말 퇴근`, department.weekendShift.checkOutWindow],
          ] as const)
        : [],
    );

    for (const [label, window] of [...windows, ...departmentWindows, ...weekendDepartmentWindows]) {
      if (!window) {
        continue;
      }

      if (window.start >= window.end) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} 시간 시작값은 종료값보다 빨라야 합니다.`,
        });
      }
    }

    if (!value.zones.some((zone) => zone.type === "entry" && zone.isActive)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "활성 출입 지점이 최소 1개 필요합니다.",
      });
    }

    if (!value.zones.some((zone) => zone.type === "tbm" && zone.isActive)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "활성 TBM 지점이 최소 1개 필요합니다.",
      });
    }
  });

export async function PATCH(request: Request) {
  const session = await getSession();

  if (!session || !isSystemAdminRole(session.role)) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }

  const rawBody = (await request.json()) as unknown;
  const parsed = adminSettingsSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "입력값을 확인하세요." }, { status: 400 });
  }

  const baseSettings = buildOperationalSettings(parsed.data.settings.maxGpsAccuracyM);
  const result = await saveAdminConfiguration(
    {
      settings: {
        ...baseSettings,
        checkInWindow: parsed.data.settings.checkInWindow,
        tbmWindow: parsed.data.settings.tbmWindow,
        tbmAfternoonWindow: parsed.data.settings.tbmAfternoonWindow,
        tbmCheckoutWindow: parsed.data.settings.tbmCheckoutWindow,
        checkOutWindow: parsed.data.settings.checkOutWindow,
        lateCheckInWindow: parsed.data.settings.lateCheckInWindow,
        lateCheckOutWindow: parsed.data.settings.lateCheckOutWindow,
        departmentSettings: parsed.data.settings.departmentSettings,
        maxGpsAccuracyM: parsed.data.settings.maxGpsAccuracyM,
        dayShift: {
          ...baseSettings.dayShift,
          checkInWindow: parsed.data.settings.checkInWindow,
          tbmMorningWindow: parsed.data.settings.tbmWindow,
          tbmAfternoonWindow: parsed.data.settings.tbmAfternoonWindow,
          tbmCheckoutWindow: parsed.data.settings.tbmCheckoutWindow,
          checkOutWindow: parsed.data.settings.checkOutWindow,
        },
        lateShift: {
          ...baseSettings.lateShift,
          checkInWindow: parsed.data.settings.lateCheckInWindow,
          checkOutWindow: parsed.data.settings.lateCheckOutWindow,
        },
      },
      zones: parsed.data.zones,
    },
    "master",
    null,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json(result);
}
