import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile, UserRole } from "@/lib/types";
import { ROLE_HOME } from "@/lib/types";

export async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  // Read own profile via admin client. The user is already verified by
  // supabase.auth.getUser() above; bypassing RLS for this self-read avoids
  // edge cases where the JWT hasn't propagated yet.
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  return (data as Profile | null) ?? null;
}

export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!profile.active) redirect("/login?error=inactive");
  return profile;
}

export async function requireRole(role: UserRole): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== role) redirect(ROLE_HOME[profile.role]);
  return profile;
}
