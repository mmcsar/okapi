import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "crypto";

/** Prefix so we can detect ciphertext vs legacy plaintext at rest. */
export const OKAPI_ENC_PREFIX = "okapi:aes256:";

const ALGO = "aes-256-gcm" as const;
const IV_LEN = 12;
const TAG_LEN = 16;

function masterKeyBytes(): Buffer {
  const raw =
    process.env.OKAPI_AES_KEY?.trim() ||
    process.env.OKAPI_SESSION_SECRET?.trim() ||
    process.env.OKAPI_ADMIN_CODE?.trim() ||
    "";

  if (!raw) {
    throw new Error("OKAPI_AES_KEY manquante (AES-256).");
  }

  // Accept 64-char hex (32 bytes) or any passphrase → SHA-256.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  return createHash("sha256").update(raw, "utf8").digest();
}

export function aesConfigured() {
  return Boolean(
    process.env.OKAPI_AES_KEY?.trim() ||
      process.env.OKAPI_SESSION_SECRET?.trim() ||
      process.env.OKAPI_ADMIN_CODE?.trim(),
  );
}

/**
 * AES-256-GCM encrypt → `okapi:aes256:` + base64url(iv|tag|ciphertext)
 */
export function aes256Encrypt(plaintext: string): string {
  const key = masterKeyBytes();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, encrypted]);
  return OKAPI_ENC_PREFIX + packed.toString("base64url");
}

/**
 * Decrypt AES-256-GCM payload. Throws on tamper / bad key.
 */
export function aes256Decrypt(payload: string): string {
  if (!payload.startsWith(OKAPI_ENC_PREFIX)) {
    throw new Error("Payload AES invalide.");
  }
  const packed = Buffer.from(payload.slice(OKAPI_ENC_PREFIX.length), "base64url");
  if (packed.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("Payload AES tronqué.");
  }
  const iv = packed.subarray(0, IV_LEN);
  const tag = packed.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = packed.subarray(IV_LEN + TAG_LEN);
  const key = masterKeyBytes();
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Encrypt for DB storage; empty stays empty. */
export function sealSensitive(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (v.startsWith(OKAPI_ENC_PREFIX)) return v;
  return aes256Encrypt(v);
}

/**
 * Decrypt if sealed; return plaintext unchanged if legacy / unencrypted.
 * Never throws to callers — returns null on failure.
 */
export function openSensitive(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (!v.startsWith(OKAPI_ENC_PREFIX)) return v;
  try {
    return aes256Decrypt(v);
  } catch {
    return null;
  }
}

/** Constant-time string compare (length-padded). */
export function safeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    // Still compare to reduce timing leak on length.
    const dummy = Buffer.alloc(aBuf.length);
    timingSafeEqual(aBuf, dummy);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

export type AdminSessionPayload = {
  role: "admin";
  iat: number;
  exp: number;
  v: 1;
};

const ADMIN_SESSION_HOURS = 12;

export function createAdminSessionToken(
  maxAgeHours = ADMIN_SESSION_HOURS,
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AdminSessionPayload = {
    role: "admin",
    iat: now,
    exp: now + Math.floor(maxAgeHours * 3600),
    v: 1,
  };
  return aes256Encrypt(JSON.stringify(payload));
}

export function verifyAdminSessionToken(
  token: string | undefined | null,
): AdminSessionPayload | null {
  if (!token?.trim()) return null;
  // Legacy insecure cookie — reject.
  if (token === "1") return null;
  try {
    const raw = aes256Decrypt(token.trim());
    const data = JSON.parse(raw) as AdminSessionPayload;
    if (data?.role !== "admin" || data?.v !== 1) return null;
    const now = Math.floor(Date.now() / 1000);
    if (!data.exp || data.exp < now) return null;
    return data;
  } catch {
    return null;
  }
}

export const ADMIN_SESSION_MAX_AGE_SEC = ADMIN_SESSION_HOURS * 3600;
