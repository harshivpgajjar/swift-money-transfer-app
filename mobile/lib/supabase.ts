import "react-native-url-polyfill/auto";
import { AppState, Platform } from "react-native";
import { createClient } from "@supabase/supabase-js";
import { storage } from "./storage";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in .env",
  );
}

// On web SSR there's no window — pass undefined and let supabase-js skip
// session persistence for that render. On client the storage adapter just
// proxies to localStorage (web) or AsyncStorage (native).
const isWebSSR = Platform.OS === "web" && typeof window === "undefined";

export const supabase = createClient(url, anon, {
  auth: {
    storage: isWebSSR ? undefined : storage,
    autoRefreshToken: true,
    persistSession: !isWebSSR,
    detectSessionInUrl: false,
  },
});

// Refresh tokens while the app is foregrounded; pause when backgrounded.
// AppState is native-only — skip on web.
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
