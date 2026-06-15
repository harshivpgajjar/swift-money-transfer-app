"use client";

import { createClient } from "@/lib/supabase/client";

/* Sign out on the client and hard-navigate to /login. A server action with
   redirect() left the page blank when invoked from a bare onClick. */
export async function signOutClient(scope: "local" | "global" = "local") {
  const supabase = createClient();
  try {
    await supabase.auth.signOut(scope === "global" ? { scope: "global" } : undefined);
  } finally {
    window.location.assign("/login");
  }
}
