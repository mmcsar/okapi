import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { aes256Decrypt, aes256Encrypt, openSensitive, sealSensitive } from "@/lib/crypto-aes";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase-admin";

/** Compte affiché dans l’application d’authentification. */
export const ADMIN_TOTP_PHONE = "+4550276685";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string) {
  const clean = input.replace(/=+$/g, "").replace(/\s/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = ALPHABET.indexOf(char);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret: Buffer, counter: number) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(bin % 1_000_000).padStart(6, "0");
}

export function createTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function totpAuthUrl(secret: string, phone = ADMIN_TOTP_PHONE) {
  const label = encodeURIComponent(`Okapi:${phone}`);
  const query = new URLSearchParams({
    secret,
    issuer: "Okapi",
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

export function verifyTotp(secret: string, token: string, now = Date.now()) {
  const cleaned = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  const key = base32Decode(secret);
  if (key.length < 10) return false;
  const counter = Math.floor(now / 30_000);
  const given = Buffer.from(cleaned);
  for (let skew = -1; skew <= 1; skew++) {
    const expected = Buffer.from(hotp(key, counter + skew));
    if (expected.length === given.length && timingSafeEqual(expected, given)) {
      return true;
    }
  }
  return false;
}

type PendingPayload = {
  purpose: "admin-totp";
  iat: number;
  exp: number;
  jti: string;
};

export function createTotpPendingToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload: PendingPayload = {
    purpose: "admin-totp",
    iat: now,
    exp: now + 5 * 60,
    jti: randomBytes(8).toString("hex"),
  };
  return aes256Encrypt(JSON.stringify(payload));
}

export async function totpQrDataUrl(secret: string) {
  return QRCode.toDataURL(totpAuthUrl(secret), {
    margin: 1,
    width: 240,
    errorCorrectionLevel: "M",
  });
}

function missingMfaTable(message?: string) {
  return /relation|does not exist|schema cache|okapi_admin_mfa/i.test(message || "");
}

export type AdminMfaState =
  | { status: "skip" }
  | { status: "missing" }
  | { status: "error" }
  | { status: "empty" }
  | { status: "ready"; secret: string; phone: string; confirmed: boolean };

export async function readAdminMfa(): Promise<AdminMfaState> {
  if (!isSupabaseAdminConfigured()) return { status: "skip" };
  const admin = getSupabaseAdmin();
  const res = await admin
    .from("okapi_admin_mfa")
    .select("phone, secret_enc, confirmed_at")
    .eq("id", 1)
    .maybeSingle();
  if (res.error) {
    return missingMfaTable(res.error.message)
      ? { status: "missing" }
      : { status: "error" };
  }
  if (!res.data?.secret_enc) return { status: "empty" };
  const secret = openSensitive(res.data.secret_enc as string);
  if (!secret) return { status: "error" };
  return {
    status: "ready",
    secret,
    phone: (res.data.phone as string) || ADMIN_TOTP_PHONE,
    confirmed: Boolean(res.data.confirmed_at),
  };
}

export async function ensureAdminMfaSecret() {
  const current = await readAdminMfa();
  if (current.status !== "empty") return current;
  const secret = createTotpSecret();
  const sealed = sealSensitive(secret);
  if (!sealed) return { status: "error" } as const;
  const admin = getSupabaseAdmin();
  const inserted = await admin.from("okapi_admin_mfa").insert({
    id: 1,
    phone: ADMIN_TOTP_PHONE,
    secret_enc: sealed,
  });
  if (inserted.error && !/duplicate|unique/i.test(inserted.error.message)) {
    return missingMfaTable(inserted.error.message)
      ? ({ status: "missing" } as const)
      : ({ status: "error" } as const);
  }
  return readAdminMfa();
}

export async function confirmAdminMfa() {
  const admin = getSupabaseAdmin();
  const updated = await admin
    .from("okapi_admin_mfa")
    .update({ confirmed_at: new Date().toISOString(), phone: ADMIN_TOTP_PHONE })
    .eq("id", 1);
  return !updated.error;
}

export function verifyTotpPendingToken(token: string | undefined | null) {
  if (!token?.trim()) return null;
  try {
    const data = JSON.parse(aes256Decrypt(token.trim())) as PendingPayload;
    const now = Math.floor(Date.now() / 1000);
    if (data?.purpose !== "admin-totp") return null;
    if (!data.exp || data.exp < now) return null;
    if (!data.iat || data.iat > now + 30) return null;
    return data;
  } catch {
    return null;
  }
}
