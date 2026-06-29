import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";

/* Authenticate a mobile/API caller from an "Authorization: Bearer <jwt>"
   header and require an active distributor profile. */
export async function distributorFromBearer(req: { headers: { get(name: string): string | null } }): Promise<Profile | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const admin = createAdminClient();
  const {
    data: { user },
  } = await admin.auth.getUser(token);
  if (!user) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "distributor" || !profile.active) return null;
  return profile as Profile;
}

/* Same, but requires an active FOS profile (FOS-facing dashboard/report APIs). */
export async function fosFromBearer(req: { headers: { get(name: string): string | null } }): Promise<Profile | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const admin = createAdminClient();
  const {
    data: { user },
  } = await admin.auth.getUser(token);
  if (!user) return null;

  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "fos" || !profile.active) return null;
  return profile as Profile;
}
