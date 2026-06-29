"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createClient as createBareClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile, requireRole } from "@/lib/auth";
import { adjustOutstandingCore } from "@/lib/outstanding-core";

type Result = { ok: true } | { error: string };

export async function updateOwnProfile(formData: FormData): Promise<Result> {
  const me = await requireProfile();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  if (!fullName) return { error: "Name is required" };
  if (phone && !/^[+\d][\d ]{7,}$/.test(phone)) return { error: "invalid_phone" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      full_name: fullName,
      phone: phone || null,
      ...(timezone ? { timezone } : {}),
    })
    .eq("id", me.id);
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function changePassword(formData: FormData): Promise<Result> {
  await requireProfile();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  if (!current) return { error: "current_required" };
  if (next.length < 8) return { error: "too_short" };
  if (next === current) return { error: "same_password" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not signed in" };

  // Verify the current password with a throwaway client — signing in on the
  // session client would rotate the cookie session mid-request.
  const verifier = createBareClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error: verifyErr } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: current,
  });
  if (verifyErr) return { error: "wrong_password" };

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function saveNotificationPrefs(formData: FormData): Promise<Result> {
  const me = await requireProfile();
  const prefs = {
    approved: formData.get("approved") === "true",
    cash: formData.get("cash") === "true",
    incoming: formData.get("incoming") === "true",
  };
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ notification_prefs: prefs })
    .eq("id", me.id);
  if (error) return { error: error.message };
  return { ok: true };
}

/* First-login forced change: distributor-issued default password must be
   replaced before the app can be used. */
export async function forceChangePassword(formData: FormData): Promise<Result> {
  const me = await requireProfile();
  const next = String(formData.get("next") ?? "");
  if (next.length < 8) return { error: "too_short" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Not signed in" };

  // Reject reusing the current password (incl. the distributor-issued default)
  // without hardcoding it: if the new password already signs in, it's current.
  const verifier = createBareClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error: reuseErr } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: next,
  });
  if (!reuseErr) return { error: "same_password" };

  // Change the password in the user's own session so they stay signed in and
  // land on home; clear the flag via admin (reliable, no token dependency).
  const { error: pwErr } = await supabase.auth.updateUser({ password: next });
  if (pwErr) return { error: pwErr.message };
  const admin = createAdminClient();
  const { error: flagErr } = await admin
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", me.id);
  if (flagErr) return { error: flagErr.message };
  return { ok: true };
}

/* ---------- distributor: defaulter handling ---------- */

/* Mark / clear a retailer as a defaulter. Distributor-only. Keeps the balance
   on the books — only flags the retailer for segregation + credit block. */
export async function setDefaulter(formData: FormData): Promise<Result> {
  const me = await requireRole("distributor");
  const retailerId = String(formData.get("retailer_id") ?? "");
  const on = String(formData.get("on") ?? "") === "true";
  const note = String(formData.get("note") ?? "").trim();
  if (!retailerId) return { error: "Missing retailer" };

  const admin = createAdminClient();
  // Verify the retailer belongs to this distributor.
  const { data: r } = await admin
    .from("profiles")
    .select("id, distributor_id, role")
    .eq("id", retailerId)
    .maybeSingle();
  if (!r || r.role !== "retailer" || r.distributor_id !== me.id) {
    return { error: "Invalid retailer" };
  }

  const { error } = await admin
    .from("profiles")
    .update({
      defaulted: on,
      defaulted_at: on ? new Date().toISOString() : null,
      default_note: on ? note || null : null,
    })
    .eq("id", retailerId);
  if (error) return { error: error.message };

  revalidatePath("/distributor/outstanding");
  revalidatePath("/distributor");
  return { ok: true };
}

/* ---------- distributor: accounts management ---------- */

export async function renameAccount(formData: FormData): Promise<Result> {
  const me = await requireRole("distributor");
  const id = String(formData.get("account_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return { error: "Name is required" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("accounts")
    .update({ name })
    .eq("id", id)
    .eq("distributor_id", me.id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setAccountActive(formData: FormData): Promise<Result> {
  const me = await requireRole("distributor");
  const id = String(formData.get("account_id") ?? "");
  const active = formData.get("active") === "true";

  const admin = createAdminClient();
  if (!active) {
    // Never allow deactivating the last active account.
    const { count } = await admin
      .from("accounts")
      .select("id", { count: "exact", head: true })
      .eq("distributor_id", me.id)
      .eq("active", true);
    if ((count ?? 0) <= 1) return { error: "At least one account must stay active" };
  }
  const { error } = await admin
    .from("accounts")
    .update({ active })
    .eq("id", id)
    .eq("distributor_id", me.id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function addAccount(formData: FormData): Promise<Result> {
  const me = await requireRole("distributor");
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase();
  if (!name || !slug) return { error: "Name and slug are required" };
  if (!/^[a-z0-9-]{2,24}$/.test(slug)) return { error: "Slug must be lowercase letters/numbers" };

  const admin = createAdminClient();
  const { count } = await admin
    .from("accounts")
    .select("id", { count: "exact", head: true })
    .eq("distributor_id", me.id);
  const { error } = await admin.from("accounts").insert({
    distributor_id: me.id,
    name,
    slug,
    active: true,
    display_order: count ?? 0,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setDefaultFosAutoApprove(formData: FormData): Promise<Result> {
  const me = await requireRole("distributor");
  const on = formData.get("on") === "true";
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ default_fos_auto_approve: on })
    .eq("id", me.id);
  if (error) return { error: error.message };
  return { ok: true };
}


/* ---------- manual outstanding adjustment ---------- */

export async function adjustOutstanding(formData: FormData): Promise<Result> {
  const me = await requireRole("distributor");
  const res = await adjustOutstandingCore({
    distributorId: me.id,
    retailerId: String(formData.get("retailer_id") ?? ""),
    accountId: String(formData.get("account_id") ?? ""),
    target: Number(formData.get("target")),
    note: String(formData.get("notes") ?? ""),
  });
  if ("error" in res) return res;
  revalidatePath("/distributor/outstanding");
  revalidatePath("/distributor");
  return { ok: true };
}
