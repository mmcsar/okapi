import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

/**
 * Clé serveur Supabase (bypass RLS).
 * Accepte le nouveau format `sb_secret_…` (SUPABASE_SECRET_KEY)
 * ou l’ancien JWT service_role (SUPABASE_SERVICE_ROLE_KEY).
 */
export function getSupabaseAdminKey() {
  return (
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ""
  );
}

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = getSupabaseAdminKey();

  if (!url || !serviceKey) {
    throw new Error(
      "Clé secrète Supabase manquante. Ajoute SUPABASE_SECRET_KEY (sb_secret_…) ou SUPABASE_SERVICE_ROLE_KEY dans .env.local — Dashboard → Settings → API Keys.",
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
