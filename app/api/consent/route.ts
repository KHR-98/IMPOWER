import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { saveConsentRecord } from "@/lib/consent-store";

const requiredConsentBoolean = z.boolean().refine((value) => value === true);

const consentSchema = z.object({
  signedName: z.string().trim().min(1).max(100),
  items: z.object({
    personalInfo: requiredConsentBoolean,
    locationInfo: requiredConsentBoolean,
    cameraPolicyCheck: requiredConsentBoolean,
    cloudProcessing: requiredConsentBoolean,
    refusalManualFallback: requiredConsentBoolean,
    signatureLogStorage: requiredConsentBoolean,
  }),
});

function getRequestIp(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedFor) {
    return forwardedFor;
  }

  return headers.get("x-real-ip")?.trim() || null;
}

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const parsed = consentSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "필수 동의 항목과 이름 입력을 확인하세요." }, { status: 400 });
  }

  await saveConsentRecord({
    username: session.username,
    signedName: parsed.data.signedName,
    userAgent: request.headers.get("user-agent"),
    ipAddress: getRequestIp(request.headers),
    items: parsed.data.items,
  });

  return NextResponse.json({ ok: true });
}
