import "server-only";

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

import { DEFAULT_SESSION_SECRET } from "@/lib/auth-config";

const TOKEN_RANDOM_BYTES = 18;
const ENCRYPTION_IV_BYTES = 12;
const ENCRYPTION_AUTH_TAG_BYTES = 16;

const PREFIX_BY_DEPARTMENT_CODE: Record<string, string> = {
  memory: "mem",
  memory_pcs: "mpcs",
  foundry_pcs: "fpcs",
};

function getInviteLinkSecret(): string {
  return process.env.INVITE_LINK_SECRET ?? process.env.SESSION_SECRET ?? DEFAULT_SESSION_SECRET;
}

function getEncryptionKey(): Buffer {
  return createHash("sha256").update(`${getInviteLinkSecret()}:invite-link-encryption`).digest();
}

function toBase64Url(bytes: Buffer): string {
  return bytes.toString("base64url");
}

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export function normalizeInviteToken(token: string): string {
  return token.trim();
}

export function hashInviteToken(token: string): string {
  return createHmac("sha256", getInviteLinkSecret())
    .update(normalizeInviteToken(token))
    .digest("hex");
}

export function encryptInviteToken(token: string): string {
  const iv = randomBytes(ENCRYPTION_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(normalizeInviteToken(token), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return toBase64Url(Buffer.concat([iv, authTag, encrypted]));
}

export function decryptInviteToken(payload: string | null): string | null {
  if (!payload) return null;

  try {
    const packed = fromBase64Url(payload);
    const iv = packed.subarray(0, ENCRYPTION_IV_BYTES);
    const authTag = packed.subarray(ENCRYPTION_IV_BYTES, ENCRYPTION_IV_BYTES + ENCRYPTION_AUTH_TAG_BYTES);
    const encrypted = packed.subarray(ENCRYPTION_IV_BYTES + ENCRYPTION_AUTH_TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function buildInviteTokenPrefix(departmentCode: string): string {
  const fallback = departmentCode.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 8);
  return PREFIX_BY_DEPARTMENT_CODE[departmentCode] ?? fallback ?? "dept";
}

export function generateInviteToken(departmentCode: string): string {
  return `${buildInviteTokenPrefix(departmentCode)}_${toBase64Url(randomBytes(TOKEN_RANDOM_BYTES))}`;
}
