"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase";

type AuthContextValue = {
  ready: boolean;
  configured: boolean;
  session: Session | null;
  user: User | null;
  displayName: string;
  accessToken: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<string | null>;
  signOut: () => Promise<void>;
  authFetch: (input: string, init?: RequestInit) => Promise<Response>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [ready, setReady] = useState(!configured);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!configured) return;
    const supabase = getSupabase();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });

    return () => sub.subscription.unsubscribe();
  }, [configured]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabase().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return error?.message ?? null;
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const { error } = await getSupabase().auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            display_name: displayName?.trim() || email.split("@")[0],
          },
        },
      });
      return error?.message ?? null;
    },
    [],
  );

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
  }, []);

  const authFetch = useCallback(
    async (input: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (session?.access_token) {
        headers.set("Authorization", `Bearer ${session.access_token}`);
      }
      if (!headers.has("Content-Type") && init?.body) {
        headers.set("Content-Type", "application/json");
      }
      return fetch(input, { ...init, headers });
    },
    [session?.access_token],
  );

  const displayName = useMemo(() => {
    const meta = session?.user?.user_metadata?.display_name;
    if (typeof meta === "string" && meta.trim()) return meta.trim();
    const email = session?.user?.email;
    if (email) return email.split("@")[0];
    return "Invité";
  }, [session]);

  const value: AuthContextValue = {
    ready,
    configured,
    session,
    user: session?.user ?? null,
    displayName,
    accessToken: session?.access_token ?? null,
    signIn,
    signUp,
    signOut,
    authFetch,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
