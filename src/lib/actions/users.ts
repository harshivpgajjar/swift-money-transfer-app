"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import {
  AssignRetailerSchema,
  SetActiveSchema,
  SetAllFosAutoApproveSchema,
  SetFosAutoApproveSchema,
} from "@/lib/zod-schemas";
import { createFosUser, createRetailerUser } from "@/lib/users-core";

type Result = { ok: true } | { error: string };

export async function createFos(formData: FormData): Promise<Result> {
  const distributor = await requireRole("distributor");
  const result = await createFosUser(distributor, {
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    password: formData.get("password"),
    phone: formData.get("phone"),
  });
  if ("ok" in result) revalidatePath("/distributor/users");
  return result;
}

export async function createRetailer(formData: FormData): Promise<Result> {
  const distributor = await requireRole("distributor");
  const result = await createRetailerUser(distributor.id, {
    retailer_code: formData.get("retailer_code"),
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    password: formData.get("password"),
    phone: formData.get("phone"),
    fos_id: formData.get("fos_id") || undefined,
  });
  if ("ok" in result) {
    revalidatePath("/distributor/users");
    revalidatePath("/distributor/outstanding");
  }
  return result;
}

export async function assignRetailerToFos(formData: FormData): Promise<Result> {
  const distributor = await requireRole("distributor");
  const fosIdRaw = formData.get("fos_id");
  const parsed = AssignRetailerSchema.safeParse({
    retailer_id: formData.get("retailer_id"),
    fos_id: fosIdRaw && fosIdRaw !== "" ? fosIdRaw : null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const admin = createAdminClient();

  // The target FOS must belong to the caller's own org — the admin client
  // bypasses RLS, so verify tenant membership explicitly.
  if (parsed.data.fos_id) {
    const { data: fos } = await admin
      .from("profiles")
      .select("id")
      .eq("id", parsed.data.fos_id)
      .eq("distributor_id", distributor.id)
      .eq("role", "fos")
      .maybeSingle();
    if (!fos) return { error: "Invalid FOS" };
  }

  const { error } = await admin
    .from("profiles")
    .update({
      fos_id: parsed.data.fos_id,
      needs_assignment: parsed.data.fos_id === null,
    })
    .eq("id", parsed.data.retailer_id)
    .eq("distributor_id", distributor.id)
    .eq("role", "retailer");
  if (error) return { error: error.message };

  revalidatePath("/distributor/users");
  return { ok: true };
}

export async function setFosAutoApprove(formData: FormData): Promise<Result> {
  const distributor = await requireRole("distributor");
  const parsed = SetFosAutoApproveSchema.safeParse({
    fos_id: formData.get("fos_id"),
    auto_approve: formData.get("auto_approve") === "true",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ fos_auto_approve: parsed.data.auto_approve })
    .eq("id", parsed.data.fos_id)
    .eq("distributor_id", distributor.id)
    .eq("role", "fos");
  if (error) return { error: error.message };

  revalidatePath("/distributor/users");
  return { ok: true };
}

export async function setAllFosAutoApprove(formData: FormData): Promise<Result> {
  const distributor = await requireRole("distributor");
  const parsed = SetAllFosAutoApproveSchema.safeParse({
    auto_approve: formData.get("auto_approve") === "true",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ fos_auto_approve: parsed.data.auto_approve })
    .eq("distributor_id", distributor.id)
    .eq("role", "fos");
  if (error) return { error: error.message };

  revalidatePath("/distributor/users");
  return { ok: true };
}

export async function setActive(formData: FormData): Promise<Result> {
  const distributor = await requireRole("distributor");
  const parsed = SetActiveSchema.safeParse({
    user_id: formData.get("user_id"),
    active: formData.get("active") === "true",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.user_id === distributor.id) {
    return { error: "You cannot deactivate yourself." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ active: parsed.data.active })
    .eq("id", parsed.data.user_id)
    .eq("distributor_id", distributor.id);
  if (error) return { error: error.message };

  revalidatePath("/distributor/users");
  return { ok: true };
}
