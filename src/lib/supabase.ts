import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

import type { OkapiArtifacts } from "@/lib/project-artifacts";

export type OkapiProject = {
  id: string;
  user_id: string;
  title: string;
  sector: string;
  html: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
  is_public?: boolean;
  share_slug?: string | null;
  artifacts?: OkapiArtifacts | null;
  backend_sql?: string | null;
  backend_api?: string | null;
  backend_readme?: string | null;
};

export function isSupabaseConfigured() {
  return Boolean(url && key);
}

export function getSupabaseConfig() {
  if (!url || !key) {
    throw new Error(
      "Okapi n’est pas encore prêt pour les comptes. Réessaie plus tard.",
    );
  }
  return { url, key };
}

let browserClient: SupabaseClient | null = null;

/** Browser / client-side singleton */
export function getSupabase() {
  const { url: u, key: k } = getSupabaseConfig();
  if (!browserClient) {
    browserClient = createClient(u, k, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return browserClient;
}

/** Server client scoped to a user access token (RLS applies). */
export function getSupabaseWithToken(accessToken: string) {
  const { url: u, key: k } = getSupabaseConfig();
  return createClient(u, k, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function getUserFromAuthHeader(
  request: Request,
): Promise<{ user: User; token: string; supabase: SupabaseClient } | null> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return null;

  const token = match[1].trim();
  const supabase = getSupabaseWithToken(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { user: data.user, token, supabase };
}

export async function requireUser(request: Request) {
  const session = await getUserFromAuthHeader(request);
  if (!session) {
    return {
      error: Response.json(
        { error: "Connexion requise. Ouvre Connexion pour créer un compte." },
        { status: 401 },
      ),
    } as const;
  }
  return { session } as const;
}
