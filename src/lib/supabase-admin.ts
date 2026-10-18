import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

export const SUPABASE_ADMIN_SETUP_MESSAGE =
  "Ce serveur n’a pas la clé secrète. Sur okapii.tech elle est déjà en place. En local, ajoute SUPABASE_SECRET_KEY (sb_secret_…) dans .env.local.";

function jwtRole(token: string) {
  const part = token.split(".")[1];
  if (!part) return "";
  try {
    const payload = JSON.parse(
      Buffer.from(part, "base64url").toString("utf8"),
    ) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : "";
  } catch {
    return "";
  }
}

/** Vraie clé admin : sb_secret_… ou JWT dont le rôle est service_role. */
export function isSupabaseServiceKey(key: string) {
  const value = key.trim();
  if (!value) return false;
  if (value.startsWith("sb_secret_")) return true;
  if (value.startsWith("sb_publishable_") || value.startsWith("sk")) return false;
  if (value.startsWith("eyJ")) return jwtRole(value) === "service_role";
  return false;
}

/**
 * Clé serveur Supabase (bypass RLS).
 * Ignore une clé publique collée par erreur dans SUPABASE_SECRET_KEY
 * et prend SUPABASE_SERVICE_ROLE_KEY si c’est elle la vraie clé secrète.
 */
export function getSupabaseAdminKey() {
  const candidates = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SECRET_KEY,
  ];
  for (const raw of candidates) {
    const key = raw?.trim() || "";
    if (isSupabaseServiceKey(key)) return key;
  }
  return "";
}

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = getSupabaseAdminKey();

  if (!url || !serviceKey) {
    throw new Error(
      SUPABASE_ADMIN_SETUP_MESSAGE,
    );
  }

  if (!adminClient) {
    adminClient = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return adminClient;
}

export function isSupabaseAdminConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && getSupabaseAdminKey(),
  );
}
