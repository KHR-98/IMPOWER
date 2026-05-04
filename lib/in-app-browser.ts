interface InAppBrowserRule {
  label: string;
  pattern: RegExp;
}

export interface InAppBrowserInfo {
  isInApp: boolean;
  label: string | null;
}

const IN_APP_BROWSER_RULES: InAppBrowserRule[] = [
  { label: "카카오톡", pattern: /KAKAOTALK|KakaoTalk/i },
  { label: "인스타그램", pattern: /Instagram/i },
  { label: "페이스북", pattern: /FBAN|FBAV|FB_IAB|FB4A|FBIOS/i },
  { label: "네이버 인앱 브라우저", pattern: /NAVER\([^)]*inapp/i },
  { label: "라인", pattern: /Line\//i },
];

export const IN_APP_BROWSER_ATTENDANCE_MESSAGE =
  "보안을 확인할 수 없습니다. Chrome 또는 삼성 인터넷에서 다시 접속해 주세요.";

export function getInAppBrowserInfo(userAgent: string | null | undefined): InAppBrowserInfo {
  const value = userAgent ?? "";
  const matched = IN_APP_BROWSER_RULES.find((rule) => rule.pattern.test(value));

  if (!matched) {
    return { isInApp: false, label: null };
  }

  return { isInApp: true, label: matched.label };
}

export function buildAndroidBrowserIntentUrl(
  targetUrl: string,
  packageName: string,
  fallbackUrl: string = targetUrl,
): string {
  try {
    const parsed = new URL(targetUrl);
    const scheme = parsed.protocol.replace(":", "") || "https";
    const withoutScheme = targetUrl.replace(/^[a-z][a-z\d+\-.]*:\/\//i, "");

    return (
      `intent://${withoutScheme}` +
      `#Intent;scheme=${scheme};package=${packageName};` +
      `S.browser_fallback_url=${encodeURIComponent(fallbackUrl)};end`
    );
  } catch {
    return targetUrl;
  }
}
