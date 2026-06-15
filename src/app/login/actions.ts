"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_HOME, type UserRole } from "@/lib/types";

const LoginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password is too short"),
  next: z.string().optional(),
});

import type { LoginState } from "./types";

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) {
    return { error: "Wrong email or password" };
  }

  // Prefer profile.role as source of truth; fall back to JWT app_metadata.
  // Use admin client to avoid races between signInWithPassword cookie write and
  // RLS evaluation on the same request.
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, active")
    .eq("id", data.user.id)
    .single();

  if (!profile) {
    await supabase.auth.signOut();
    return { error: "No profile linked to this account. Contact your distributor." };
  }
  if (!profile.active) {
    await supabase.auth.signOut();
    return { error: "Account is deactivated. Contact your distributor." };
  }

  const role = profile.role as UserRole;
  const next = parsed.data.next && parsed.data.next.startsWith("/")
    ? parsed.data.next
    : ROLE_HOME[role];

  redirect(next);
}
