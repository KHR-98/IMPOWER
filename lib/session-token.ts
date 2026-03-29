import type { SessionUser } from "@/lib/types";

import { DEFAULT_SESSION_SECRET, SESSION_MAX_AGE_SECONDS } from "@/lib/auth-config";

export interface SessionPayload extends SessionUser {
  issuedAt: string;
}

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET ?? DEFAULT_SESSION_SECRET;

  if (process.env.NODE_ENV === "production" && secret === DEFAULT_SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be configured in production.");
  }

  return secret;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array | null {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  } catch {
    return null;
  }
}

async function createSignature(encodedPayload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encodedPayload));
  return encodeBase64Url(new Uint8Array(signature));
}

export async function encodeSessionToken(payload: SessionPayload): Promise<string> {
  const encodedPayload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await createSignature(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  const [encodedPayload, providedSignature] = token.split(".");

  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = await createSignature(encodedPayload);

  if (providedSignature !== expectedSignature) {
    return null;
  }

  const decodedPayload = decodeBase64Url(encodedPayload);

  if (!decodedPayload) {
    return null;
  }

  try {
    const payload = JSON.parse(new TextDecoder().decode(decodedPayload)) as SessionPayload;
    const issuedAt = Date.parse(payload.issuedAt);

    if (!Number.isFinite(issuedAt) || issuedAt + SESSION_MAX_AGE_SECONDS * 1000 <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
