import { NextResponse } from "next/server";
import { z } from "zod";

import { performAttendanceAction } from "@/lib/app-data";
import { isMdmRequiredAttendanceAction } from "@/lib/attendance-security";
import { isAttendanceAction } from "@/lib/attendance-rules";
import { getSession } from "@/lib/auth";
import { hasCurrentConsent } from "@/lib/consent-store";
import {
  DEPARTMENT_FEATURE_DISABLED_MESSAGE,
  isAttendanceActionAllowedForDepartment,
} from "@/lib/department-feature-policy";
import { getInAppBrowserInfo, IN_APP_BROWSER_ATTENDANCE_MESSAGE } from "@/lib/in-app-browser";

const attendanceActionSchema = z.object({
  zoneId: z.string().min(1),
  zoneCheckResult: z.enum(["ALLOWED", "NOT_ALLOWED", "FAILED"]),
  accuracyCheckResult: z.enum(["PASS", "FAIL"]),
  mdmVerified: z.boolean().optional(),
  cameraTestResult: z.enum(["CAMERA_ACCESSIBLE", "CAMERA_BLOCKED_OR_DENIED", "CAMERA_TEST_ERROR"]).nullable().optional(),
}).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { action } = await context.params;

  if (!isAttendanceAction(action)) {
    return NextResponse.json({ error: "지원하지 않는 기록 유형입니다." }, { status: 404 });
  }

  if (!(await hasCurrentConsent(session.username))) {
    return NextResponse.json(
      { error: "필수 동의가 완료되지 않았습니다. 동의 후 자동 앱 기반 입·출문을 사용할 수 있습니다." },
      { status: 403 },
    );
  }

  if (!isAttendanceActionAllowedForDepartment(action, session.departmentCode)) {
    return NextResponse.json({ error: DEPARTMENT_FEATURE_DISABLED_MESSAGE }, { status: 403 });
  }

  if (isMdmRequiredAttendanceAction(action)) {
    const inAppBrowser = getInAppBrowserInfo(request.headers.get("user-agent"));

    if (inAppBrowser.isInApp) {
      return NextResponse.json(
        {
          error: `${inAppBrowser.label ?? "인앱 브라우저"}에서는 출결 보안 확인을 진행할 수 없습니다. ${IN_APP_BROWSER_ATTENDANCE_MESSAGE}`,
        },
        { status: 403 },
      );
    }
  }

  const parsed = attendanceActionSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "출결 확인 결과 형식이 올바르지 않습니다." }, { status: 400 });
  }

  if (
    isMdmRequiredAttendanceAction(action) &&
    (parsed.data.mdmVerified !== true || parsed.data.cameraTestResult !== "CAMERA_BLOCKED_OR_DENIED")
  ) {
    return NextResponse.json(
      {
        error:
          "보안 앱/카메라 제한 정책 확인 결과가 누락되었거나 '차단됨' 상태가 아닙니다. " +
          "MDM/보안 앱 활성화 여부와 브라우저 카메라 권한 상태를 확인한 뒤 다시 시도하세요.",
      },
      { status: 403 },
    );
  }

  const result = await performAttendanceAction({
    username: session.username,
    action,
    sessionUser: session,
    ...parsed.data,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ message: result.message, eventStates: result.eventStates });
}
