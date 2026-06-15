import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "./supabase";
import { registerForPush, unregisterPush } from "./push";
import type { Profile } from "./types";

type AuthState = {
  loading: boolean;
  profile: Profile | null;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  async function pull() {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
      // Invalid refresh tokens land here as the stored session simply being null.
      // If Supabase reports an explicit error, treat it like signed-out.
      if (error || !session?.user) {
        setProfile(null);
        return;
      }
      const p = await loadProfile(session.user.id);
      setProfile(p);
    } catch {
      // Anything else (revoked refresh token, network blip on refresh) → log out
      // locally so the login screen renders instead of an uncaught error.
      await supabase.auth.signOut().catch(() => {});
      setProfile(null);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      await pull();
      if (mounted) setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // SIGNED_OUT covers both a manual sign-out and a failed token refresh
      // (Supabase emits SIGNED_OUT when it gives up on a stale refresh token).
      if (event === "SIGNED_OUT" || !session?.user) {
        setProfile(null);
        return;
      }
      // Only a (re)sign-in changes which profile we need. Token refreshes and
      // user-updates don't touch the profiles row — skipping them avoids both
      // pointless fetches and a stale fetch racing a just-updated profile.
      if (event !== "SIGNED_IN" && event !== "INITIAL_SESSION") return;
      // Defer: supabase-js awaits listeners while holding its auth lock, so
      // doing network work inline stalls auth calls (updateUser etc).
      const userId = session.user.id;
      setTimeout(() => {
        loadProfile(userId)
          .then(setProfile)
          .catch(() => setProfile(null));
      }, 0);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Register this device for push whenever a profile becomes active.
  useEffect(() => {
    if (profile?.id) void registerForPush(profile.id);
  }, [profile?.id]);

  async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.user) return { error: error?.message ?? "Sign in failed" };

    const p = await loadProfile(data.user.id);
    if (!p) {
      await supabase.auth.signOut();
      return { error: "No profile linked to this account. Contact your distributor." };
    }
    if (!p.active) {
      await supabase.auth.signOut();
      return { error: "Account is deactivated. Contact your distributor." };
    }
    setProfile(p);
    return {};
  }

  async function signOut() {
    const id = profile?.id;
    if (id) await unregisterPush(id).catch(() => {});
    await supabase.auth.signOut();
    setProfile(null);
  }

  return (
    <Ctx.Provider value={{ loading, profile, signIn, signOut, refresh: pull }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
