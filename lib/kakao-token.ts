import "server-only";

import { DEFAULT_SESSION_SECRET } from "@/lib/auth-config";

// Short-lived pending token: holds kakao_id + kakao nickname before user registers their name.
// Expires in 10 minutes.
const PENDING_MAX_AGE_MS = 10 * 60 * 1000;

export interface KakaoPendingPayload {
  kakaoId: string;
  kakaoNickname: string;
  issuedAt: string;
}

function getSecret(): string {
  return process.env.SESSION_SECRET ?? DEFAULT_SESSION_SECRET;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array | null {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return encodeBase64Url(new Uint8Array(sig));
}

export async function encodeKakaoPendingToken(payload: Omit<KakaoPendingPayload, "issuedAt">): Promise<string> {
  const full: KakaoPendingPayload = { ...payload, issuedAt: new Date().toISOString() };
  const encoded = encodeBase64Url(new TextEncoder().encode(JSON.stringify(full)));
  const signature = await sign(encoded);
  return `${encoded}.${signature}`;
}

export async function verifyKakaoPendingToken(token: string): Promise<KakaoPendingPayload | null> {
  const [encoded, provided] = token.split(".");
  if (!encoded || !provided) return null;

  const expected = await sign(encoded);
  if (provided !== expected) return null;

  const bytes = decodeBase64Url(encoded);
  if (!bytes) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as KakaoPendingPayload;
    const issuedAt = Date.parse(payload.issuedAt);
    if (!Number.isFinite(issuedAt) || issuedAt + PENDING_MAX_AGE_MS <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
