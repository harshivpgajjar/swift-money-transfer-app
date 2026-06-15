import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreateFosSchema, CreateRetailerSchema } from "@/lib/zod-schemas";

/* User creation requires the service-role key, so it runs only on the
   server — shared by the web server actions and the Bearer-authenticated
   mobile API routes. */

type Result = { ok: true } | { error: string };

export async function createFosUser(
  distributor: { id: string; default_fos_auto_approve?: boolean },
  input: unknown,
): Promise<Result> {
  const parsed = CreateFosSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const admin = createAdminClient();
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    app_metadata: { role: "fos" },
  });
  if (authErr || !created.user) {
    return { error: authErr?.message ?? "Failed to create account" };
  }

  const { error: profileErr } = await admin.from("profiles").insert({
    id: created.user.id,
    role: "fos",
    full_name: parsed.data.full_name,
    phone: parsed.data.phone || null,
    distributor_id: distributor.id,
    fos_auto_approve: distributor.default_fos_auto_approve === true,
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: profileErr.message };
  }
  return { ok: true };
}

export async function createRetailerUser(
  distributorId: string,
  input: unknown,
): Promise<Result> {
  const parsed = CreateRetailerSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const admin = createAdminClient();

  // The assigned FOS must belong to the caller's own org — the admin client
  // bypasses RLS, so verify tenant membership explicitly.
  if (parsed.data.fos_id) {
    const { data: fos } = await admin
      .from("profiles")
      .select("id")
      .eq("id", parsed.data.fos_id)
      .eq("distributor_id", distributorId)
      .eq("role", "fos")
      .maybeSingle();
    if (!fos) return { error: "Invalid FOS" };
  }

  const { count, error: countErr } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("retailer_code", parsed.data.retailer_code);
  if (countErr) return { error: countErr.message };
  if (count && count > 0) {
    return { error: `Retailer code ${parsed.data.retailer_code} already exists` };
  }

  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    app_metadata: { role: "retailer" },
  });
  if (authErr || !created.user) {
    return { error: authErr?.message ?? "Failed to create account" };
  }

  const { error: profileErr } = await admin.from("profiles").insert({
    id: created.user.id,
    role: "retailer",
    full_name: parsed.data.full_name,
    retailer_code: parsed.data.retailer_code,
    phone: parsed.data.phone || null,
    fos_id: parsed.data.fos_id || null,
    distributor_id: distributorId,
  });
  if (profileErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: profileErr.message };
  }
  return { ok: true };
}
