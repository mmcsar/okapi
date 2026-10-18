import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
  SUPABASE_ADMIN_SETUP_MESSAGE,
} from "@/lib/supabase-admin";

export const runtime = "nodejs";

const DAY_WINDOW = 14;
const USER_PAGE = 200;
const CHAT_ABUSE = 20;
const CHAT_WATCH = 12;
const GEN_ABUSE = 6;
const GEN_WATCH = 4;
const VISIT_ABUSE = 25;
const VISIT_WATCH = 12;
const SWEEP_PATHS = 6;
const SWEEP_MS = 60 * 60 * 1000;

type Flag = { level: "abuse" | "watch"; label: string };

type AudiencePerson = {
  id: string;
  email: string;
  name: string;
  city: string;
  country: string;
  phone: string;
  createdAt: string | null;
  lastSignInAt: string | null;
  projects: number;
  lastProjectAt: string | null;
  lastProjectTitle: string | null;
  projectList: { title: string; at: string | null }[];
  chats7d: number;
  generates7d: number;
  chats14d: number;
  generates14d: number;
  usageDays: { day: string; chats: number; generates: number }[];
  flags: Flag[];
};

function pushFlag(flags: Flag[], flag: Flag) {
  if (flags.some((item) => item.label === flag.label)) return;
  flags.push(flag);
}

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

type VisitRow = {
  created_at: string;
  path: string;
  user_id: string | null;
  display_name: string | null;
  city: string | null;
  country: string | null;
  visitor_key: string;
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
        error: SUPABASE_ADMIN_SETUP_MESSAGE,
        setupRequired: true,
      },
      { status: 503 },
    );
  }

  const admin = getSupabaseAdmin();
  const days = lastDays(DAY_WINDOW);
  const since = `${days[0]}T00:00:00.000Z`;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [usersRes, profilesRes, projectsRes, usageRes, visitsRes] = await Promise.all([
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
    admin
      .from("okapi_visits")
      .select("created_at, path, user_id, display_name, city, country, visitor_key")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
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
    {
      count: number;
      lastAt: string | null;
      title: string | null;
      items: { title: string; at: string | null }[];
    }
  >();
  for (const row of (projectsRes.data || []) as ProjectRow[]) {
    const cur = projectsByUser.get(row.user_id) ?? {
      count: 0,
      lastAt: null,
      title: null,
      items: [],
    };
    cur.count += 1;
    const when = row.updated_at || row.created_at;
    if (when && (!cur.lastAt || when > cur.lastAt)) {
      cur.lastAt = when;
      cur.title = row.title;
    }
    if (cur.items.length < 40) {
      cur.items.push({ title: row.title || "Sans titre", at: when });
    }
    projectsByUser.set(row.user_id, cur);
  }
  for (const bucket of projectsByUser.values()) {
    bucket.items.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  }

  const usageByUser = new Map<
    string,
    { chats: number; generates: number; chats14: number; generates14: number }
  >();
  const usageDaysByUser = new Map<string, Map<string, { chats: number; generates: number }>>();
  const usageMissing = Boolean(usageRes.error && missingTable(usageRes.error.message));
  const usageRows = (usageMissing ? [] : usageRes.data || []) as UsageRow[];
  const dayChats = new Map<string, number>();
  const dayGenerates = new Map<string, number>();
  const guestKeys = new Set<string>();
  const guestUsageDays = new Map<string, Map<string, { chats: number; generates: number }>>();
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
      const cur = usageByUser.get(userId) ?? {
        chats: 0,
        generates: 0,
        chats14: 0,
        generates14: 0,
      };
      cur.chats14 += chats;
      cur.generates14 += generates;
      if (day >= dayKey(weekAgo)) {
        cur.chats += chats;
        cur.generates += generates;
      }
      usageByUser.set(userId, cur);
      const byDay = usageDaysByUser.get(userId) ?? new Map();
      const slot = byDay.get(day) ?? { chats: 0, generates: 0 };
      slot.chats += chats;
      slot.generates += generates;
      byDay.set(day, slot);
      usageDaysByUser.set(userId, byDay);
    } else if (chats + generates > 0) {
      if (day >= dayKey(weekAgo)) guestKeys.add(row.quota_key);
      const byDay = guestUsageDays.get(row.quota_key) ?? new Map();
      const slot = byDay.get(day) ?? { chats: 0, generates: 0 };
      slot.chats += chats;
      slot.generates += generates;
      byDay.set(day, slot);
      guestUsageDays.set(row.quota_key, byDay);
    }
  }

  function flagsFromDays(byDay: Map<string, { chats: number; generates: number }> | undefined) {
    const flags: Flag[] = [];
    if (!byDay) return flags;
    for (const [day, slot] of byDay) {
      if (slot.chats >= CHAT_ABUSE) {
        pushFlag(flags, {
          level: "abuse",
          label: `${slot.chats} messages le ${day} — plafond gratuit atteint`,
        });
      } else if (slot.chats >= CHAT_WATCH) {
        pushFlag(flags, {
          level: "watch",
          label: `${slot.chats} messages le ${day}`,
        });
      }
      if (slot.generates >= GEN_ABUSE) {
        pushFlag(flags, {
          level: "abuse",
          label: `${slot.generates} générations le ${day} — plafond gratuit atteint`,
        });
      } else if (slot.generates >= GEN_WATCH) {
        pushFlag(flags, {
          level: "watch",
          label: `${slot.generates} générations le ${day}`,
        });
      }
    }
    return flags;
  }

  function usageFlags(userId: string) {
    return flagsFromDays(usageDaysByUser.get(userId));
  }

  const authUsers = usersRes.data?.users ?? [];
  const seen = new Set<string>();
  const people: AudiencePerson[] = [];

  for (const user of authUsers) {
    seen.add(user.id);
    const profile = profiles.get(user.id);
    const projects = projectsByUser.get(user.id);
    const usage = usageByUser.get(user.id);
    const byDay = usageDaysByUser.get(user.id);
    people.push({
      id: user.id,
      email: user.email || "—",
      name:
        profile?.full_name ||
        profile?.display_name ||
        (user.user_metadata?.display_name as string | undefined) ||
        user.email?.split("@")[0] ||
        "Compte Okapi",
      city: profile?.city || "",
      country: "",
      phone: profile?.phone || user.phone || "",
      createdAt: user.created_at || null,
      lastSignInAt: user.last_sign_in_at || null,
      projects: projects?.count ?? 0,
      lastProjectAt: projects?.lastAt ?? null,
      lastProjectTitle: projects?.title ?? null,
      projectList: projects?.items ?? [],
      chats7d: usage?.chats ?? 0,
      generates7d: usage?.generates ?? 0,
      chats14d: usage?.chats14 ?? 0,
      generates14d: usage?.generates14 ?? 0,
      usageDays: byDay
        ? [...byDay.entries()]
            .map(([day, slot]) => ({ day, chats: slot.chats, generates: slot.generates }))
            .sort((a, b) => b.day.localeCompare(a.day))
        : [],
      flags: usageFlags(user.id),
    });
  }

  if (!authUsers.length) {
    for (const [id, profile] of profiles) {
      if (seen.has(id)) continue;
      const projects = projectsByUser.get(id);
      const usage = usageByUser.get(id);
      const byDay = usageDaysByUser.get(id);
      people.push({
        id,
        email: "—",
        name: profile.full_name || profile.display_name || "Compte Okapi",
        city: profile.city || "",
        country: "",
        phone: profile.phone || "",
        createdAt: null,
        lastSignInAt: null,
        projects: projects?.count ?? 0,
        lastProjectAt: projects?.lastAt ?? null,
        lastProjectTitle: projects?.title ?? null,
        projectList: projects?.items ?? [],
        chats7d: usage?.chats ?? 0,
        generates7d: usage?.generates ?? 0,
        chats14d: usage?.chats14 ?? 0,
        generates14d: usage?.generates14 ?? 0,
        usageDays: byDay
          ? [...byDay.entries()]
              .map(([day, slot]) => ({ day, chats: slot.chats, generates: slot.generates }))
              .sort((a, b) => b.day.localeCompare(a.day))
          : [],
        flags: usageFlags(id),
      });
    }
  }

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

  const visitsMissing = Boolean(visitsRes.error);
  const visitRows = (visitsMissing ? [] : visitsRes.data || []) as VisitRow[];
  const visitsByDay = new Map<string, number>();
  const visitors7d = new Set<string>();
  const guestVisitors7d = new Set<string>();
  let visits7d = 0;
  const visitsByKey = new Map<
    string,
    {
      count7d: number;
      userId: string | null;
      name: string;
      city: string;
      country: string;
      events: { at: number; iso: string; path: string }[];
    }
  >();
  for (const row of visitRows) {
    const day = dayKey(row.created_at);
    visitsByDay.set(day, (visitsByDay.get(day) || 0) + 1);
    const bucket = visitsByKey.get(row.visitor_key) ?? {
      count7d: 0,
      userId: row.user_id,
      name: row.display_name || "",
      city: row.city || "",
      country: row.country || "",
      events: [],
    };
    if (row.user_id) bucket.userId = row.user_id;
    if (row.display_name && !bucket.name) bucket.name = row.display_name;
    if (row.city && !bucket.city) bucket.city = row.city;
    if (row.country && !bucket.country) bucket.country = row.country;
    const at = new Date(row.created_at).getTime();
    if (Number.isFinite(at)) {
      bucket.events.push({ at, iso: row.created_at, path: row.path });
    }
    if (row.created_at >= weekAgo) {
      visits7d += 1;
      visitors7d.add(row.visitor_key);
      bucket.count7d += 1;
      if (!row.user_id) guestVisitors7d.add(row.visitor_key);
    }
    visitsByKey.set(row.visitor_key, bucket);
  }

  const guests: {
    id: string;
    label: string;
    email: string;
    city: string;
    country: string;
    count: number;
    count7d: number;
    lastAt: string | null;
    passages: { at: string; path: string }[];
    chats14d: number;
    generates14d: number;
    usageDays: { day: string; chats: number; generates: number }[];
    flags: Flag[];
  }[] = [];

  for (const [key, bucket] of visitsByKey) {
    const flags: Flag[] = [];
    if (bucket.count7d >= VISIT_ABUSE) {
      pushFlag(flags, {
        level: "abuse",
        label: `${bucket.count7d} passages en 7 jours`,
      });
    } else if (bucket.count7d >= VISIT_WATCH) {
      pushFlag(flags, {
        level: "watch",
        label: `${bucket.count7d} passages en 7 jours`,
      });
    }
    const events = [...bucket.events].sort((a, b) => a.at - b.at);
    for (let i = 0; i < events.length; i++) {
      const paths = new Set<string>();
      for (let j = i; j < events.length; j++) {
        if (events[j].at - events[i].at > SWEEP_MS) break;
        paths.add(events[j].path);
      }
      if (paths.size >= SWEEP_PATHS) {
        pushFlag(flags, {
          level: "abuse",
          label: `${paths.size} pages différentes en moins d’une heure`,
        });
        break;
      }
    }
    const person = bucket.userId
      ? people.find((item) => item.id === bucket.userId)
      : undefined;
    if (person) {
      for (const flag of flags) pushFlag(person.flags, flag);
      if (!person.city && bucket.city) person.city = bucket.city;
      if (!person.country && bucket.country) person.country = bucket.country;
      continue;
    }
    const passages = [...bucket.events]
      .sort((a, b) => b.at - a.at)
      .slice(0, 40)
      .map((event) => ({ at: event.iso, path: event.path }));
    const place = [bucket.city, bucket.country].filter(Boolean).join(", ");
    guests.push({
      id: key.slice(0, 8),
      label: place ? `Sans compte · ${place}` : "Sans compte",
      email: "",
      city: bucket.city,
      country: bucket.country,
      count: bucket.events.length,
      count7d: bucket.count7d,
      lastAt: passages[0]?.at ?? null,
      passages,
      chats14d: 0,
      generates14d: 0,
      usageDays: [] as { day: string; chats: number; generates: number }[],
      flags,
    });
  }

  for (const [key, byDay] of guestUsageDays) {
    let chats14d = 0;
    let generates14d = 0;
    const usageDays = [...byDay.entries()]
      .map(([day, slot]) => {
        chats14d += slot.chats;
        generates14d += slot.generates;
        return { day, chats: slot.chats, generates: slot.generates };
      })
      .sort((a, b) => b.day.localeCompare(a.day));
    guests.push({
      id: `chat-${key.slice(-8)}`,
      label: "Sans compte · recherche",
      email: "",
      city: "",
      country: "",
      count: 0,
      count7d: 0,
      lastAt: usageDays[0] ? `${usageDays[0].day}T00:00:00.000Z` : null,
      passages: [],
      chats14d,
      generates14d,
      usageDays,
      flags: flagsFromDays(byDay),
    });
  }

  guests.sort((a, b) => {
    const rank = (flags: Flag[]) =>
      flags.some((flag) => flag.level === "abuse") ? 0 : flags.length ? 1 : 2;
    const byFlag = rank(a.flags) - rank(b.flags);
    if (byFlag !== 0) return byFlag;
    return (b.lastAt || "").localeCompare(a.lastAt || "");
  });

  people.sort((a, b) => {
    const rank = (flags: Flag[]) =>
      flags.some((flag) => flag.level === "abuse") ? 0 : flags.length ? 1 : 2;
    const byFlag = rank(a.flags) - rank(b.flags);
    if (byFlag !== 0) return byFlag;
    const av = a.lastSignInAt || a.lastProjectAt || a.createdAt || "";
    const bv = b.lastSignInAt || b.lastProjectAt || b.createdAt || "";
    return bv.localeCompare(av);
  });

  const alerts = [
    ...people.flatMap((person) =>
      person.flags.map((flag) => ({
        level: flag.level,
        who: person.name,
        email: person.email,
        label: flag.label,
      })),
    ),
    ...guests.flatMap((guest) =>
      guest.flags.map((flag) => ({
        level: flag.level,
        who: guest.label,
        email: "",
        label: flag.label,
      })),
    ),
  ];

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    usageReady: !usageMissing,
    visitsReady: !visitsMissing,
    truncated: authUsers.length >= USER_PAGE,
    totals: {
      accounts: people.length,
      accountsWeek: people.filter((p) => (p.createdAt || "") >= weekAgo).length,
      active7d,
      projects: (projectsRes.data || []).length,
      chats7d,
      generates7d,
      guests7d: guestKeys.size,
      visits7d,
      visitors7d: visitors7d.size,
      guestVisitors7d: guestVisitors7d.size,
      alerts: alerts.length,
      abuse: alerts.filter((alert) => alert.level === "abuse").length,
    },
    alerts,
    days: days.map((day) => ({
      day,
      signups: signupsByDay.get(day) || 0,
      chats: dayChats.get(day) || 0,
      generates: dayGenerates.get(day) || 0,
      visits: visitsByDay.get(day) || 0,
    })),
    visits: visitRows.slice(0, 80).map((row) => {
      const person = row.user_id
        ? people.find((item) => item.id === row.user_id)
        : undefined;
      return {
        at: row.created_at,
        path: row.path,
        city: row.city || person?.city || "",
        country: row.country || person?.country || "",
        name: row.user_id ? row.display_name || person?.name || "Compte Okapi" : "",
        email: person?.email && person.email !== "—" ? person.email : "",
      };
    }),
    since,
    people,
    guests,
  });
}
