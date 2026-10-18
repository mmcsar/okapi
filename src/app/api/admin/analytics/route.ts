import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
} from "@/lib/supabase-admin";

export const runtime = "nodejs";

const DAY_WINDOW = 14;
const USER_PAGE = 200;

type UsageRow = {
  quota_key: string;
  day: string;
  chat_count: number;
  generate_count: number;
};

type ProjectRow = {
  user_id: string;
  title: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  full_name: string | null;
  city: string | null;
  phone: string | null;
};

function dayKey(iso: string | null | undefined) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function lastDays(n: number) {
  const days: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i),
    );
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function missingTable(message?: string) {
  return /relation|does not exist|Could not find|schema cache/i.test(message || "");
}

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;

  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      {
        error:
          "Clé secrète Supabase manquante. Pose SUPABASE_SECRET_KEY (sb_secret_…) dans .env.local — Dashboard → API Keys.",
        setupRequired: true,
      },
      { status: 503 },
    );
  }

  const admin = getSupabaseAdmin();
  const days = lastDays(DAY_WINDOW);
  const since = `${days[0]}T00:00:00.000Z`;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [usersRes, profilesRes, projectsRes, usageRes] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: USER_PAGE }),
    admin
      .from("profiles")
      .select("id, display_name, full_name, city, phone")
      .limit(USER_PAGE),
    admin
      .from("projects")
      .select("user_id, title, updated_at, created_at")
      .order("updated_at", { ascending: false })
      .limit(500),
    admin
      .from("okapi_usage_daily")
      .select("quota_key, day, chat_count, generate_count")
      .gte("day", days[0])
      .limit(2000),
  ]);

  if (usersRes.error && profilesRes.error) {
    return NextResponse.json(
      {
        error: "Impossible de lire les comptes Okapi.",
        setupRequired: true,
      },
      { status: 503 },
    );
  }

  const profiles = new Map<string, ProfileRow>();
  for (const row of (profilesRes.data || []) as ProfileRow[]) {
    profiles.set(row.id, row);
  }

  const projectsByUser = new Map<
    string,
    { count: number; lastAt: string | null; title: string | null }
  >();
  for (const row of (projectsRes.data || []) as ProjectRow[]) {
    const cur = projectsByUser.get(row.user_id) ?? {
      count: 0,
      lastAt: null,
      title: null,
    };
    cur.count += 1;
    const when = row.updated_at || row.created_at;
    if (when && (!cur.lastAt || when > cur.lastAt)) {
      cur.lastAt = when;
      cur.title = row.title;
    }
    projectsByUser.set(row.user_id, cur);
  }

  const usageByUser = new Map<string, { chats: number; generates: number }>();
  const usageMissing = Boolean(usageRes.error && missingTable(usageRes.error.message));
  const usageRows = (usageMissing ? [] : usageRes.data || []) as UsageRow[];
  const dayChats = new Map<string, number>();
  const dayGenerates = new Map<string, number>();
  const guestKeys = new Set<string>();
  let chats7d = 0;
  let generates7d = 0;

  for (const row of usageRows) {
    const day = dayKey(row.day);
    const chats = Number(row.chat_count) || 0;
    const generates = Number(row.generate_count) || 0;
    dayChats.set(day, (dayChats.get(day) || 0) + chats);
    dayGenerates.set(day, (dayGenerates.get(day) || 0) + generates);
    if (day >= dayKey(weekAgo)) {
      chats7d += chats;
      generates7d += generates;
    }
    const userId = row.quota_key.startsWith("u:")
      ? row.quota_key.slice(2)
      : "";
    if (isUuid(userId)) {
      const cur = usageByUser.get(userId) ?? { chats: 0, generates: 0 };
      if (day >= dayKey(weekAgo)) {
        cur.chats += chats;
        cur.generates += generates;
      }
      usageByUser.set(userId, cur);
    } else if (chats + generates > 0 && day >= dayKey(weekAgo)) {
      guestKeys.add(row.quota_key);
    }
  }

  const authUsers = usersRes.data?.users ?? [];
  const seen = new Set<string>();
  const people = [];

  for (const user of authUsers) {
    seen.add(user.id);
    const profile = profiles.get(user.id);
    const projects = projectsByUser.get(user.id);
    const usage = usageByUser.get(user.id);
    people.push({
      id: user.id,
      email: user.email || "—",
      name:
        profile?.full_name ||
        profile?.display_name ||
        (user.user_metadata?.display_name as string | undefined) ||
        user.email?.split("@")[0] ||
        "Compte Okapi",
      city: profile?.city || "—",
      phone: profile?.phone || user.phone || "",
      createdAt: user.created_at || null,
      lastSignInAt: user.last_sign_in_at || null,
      projects: projects?.count ?? 0,
      lastProjectAt: projects?.lastAt ?? null,
      lastProjectTitle: projects?.title ?? null,
      chats7d: usage?.chats ?? 0,
      generates7d: usage?.generates ?? 0,
    });
  }

  if (!authUsers.length) {
    for (const [id, profile] of profiles) {
      if (seen.has(id)) continue;
      const projects = projectsByUser.get(id);
      const usage = usageByUser.get(id);
      people.push({
        id,
        email: "—",
        name: profile.full_name || profile.display_name || "Compte Okapi",
        city: profile.city || "—",
        phone: profile.phone || "",
        createdAt: null,
        lastSignInAt: null,
        projects: projects?.count ?? 0,
        lastProjectAt: projects?.lastAt ?? null,
        lastProjectTitle: projects?.title ?? null,
        chats7d: usage?.chats ?? 0,
        generates7d: usage?.generates ?? 0,
      });
    }
  }

  people.sort((a, b) => {
    const av = a.lastSignInAt || a.lastProjectAt || a.createdAt || "";
    const bv = b.lastSignInAt || b.lastProjectAt || b.createdAt || "";
    return bv.localeCompare(av);
  });

  const signupsByDay = new Map<string, number>();
  for (const person of people) {
    const day = dayKey(person.createdAt);
    if (day) signupsByDay.set(day, (signupsByDay.get(day) || 0) + 1);
  }

  const active7d = people.filter((person) => {
    const seenAt = person.lastSignInAt || person.lastProjectAt || "";
    return (
      seenAt >= weekAgo || person.chats7d > 0 || person.generates7d > 0
    );
  }).length;

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    usageReady: !usageMissing,
    truncated: authUsers.length >= USER_PAGE,
    totals: {
      accounts: people.length,
      accountsWeek: people.filter((p) => (p.createdAt || "") >= weekAgo).length,
      active7d,
      projects: (projectsRes.data || []).length,
      chats7d,
      generates7d,
      guests7d: guestKeys.size,
    },
    days: days.map((day) => ({
      day,
      signups: signupsByDay.get(day) || 0,
      chats: dayChats.get(day) || 0,
      generates: dayGenerates.get(day) || 0,
    })),
    since,
    people,
  });
}
