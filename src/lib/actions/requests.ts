"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import {
  DistributorRequestDecisionSchema,
  FosReviewSchema,
  NewMoneyRequestSchema,
} from "@/lib/zod-schemas";

type Result = { ok: true } | { error: string };

export async function createMoneyRequest(formData: FormData): Promise<Result> {
  const me = await requireRole("retailer");
  if (!me.fos_id) return { error: "No FOS assigned. Contact your distributor." };
  if (!me.distributor_id) return { error: "Profile is missing distributor link." };

  const parsed = NewMoneyRequestSchema.safeParse({
    account_id: formData.get("account_id"),
    amount: formData.get("amount"),
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("money_requests").insert({
    retailer_id: me.id,
    fos_id: me.fos_id,
    distributor_id: me.distributor_id,
    account_id: parsed.data.account_id,
    requested_amount: parsed.data.amount,
    fos_notes: parsed.data.notes || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/retailer");
  revalidatePath("/retailer/history");
  revalidatePath("/fos/inbox");
  return { ok: true };
}

export async function fosReviewRequest(formData: FormData): Promise<Result> {
  const me = await requireRole("fos");
  const parsed = FosReviewSchema.safeParse({
    request_id: formData.get("request_id"),
    decision: formData.get("decision"),
    amount: formData.get("amount") || undefined,
    notes: formData.get("notes") || undefined,
    account_id: formData.get("account_id") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: existing, error: existsErr } = await supabase
    .from("money_requests")
    .select("id, retailer_id, account_id, fos_id, requested_amount, fos_status")
    .eq("id", parsed.data.request_id)
    .eq("fos_id", me.id)
    .single();
  if (existsErr || !existing) return { error: "Request not found" };
  if (existing.fos_status !== "pending") {
    return { error: "Already reviewed" };
  }

  const now = new Date().toISOString();
  const autoApprove = me.fos_auto_approve === true;
  let finalAmount: number | null = null;

  const update: Record<string, unknown> = {
    fos_acted_at: now,
    fos_notes: parsed.data.notes || null,
  };

  // The FOS may move the request to a different account (Swift Money / A2Z).
  let effectiveAccountId = existing.account_id as string;
  if (
    parsed.data.account_id &&
    parsed.data.account_id !== existing.account_id &&
    parsed.data.decision !== "decline"
  ) {
    // Verify the account belongs to this org.
    const { data: acct } = await admin
      .from("accounts")
      .select("id")
      .eq("id", parsed.data.account_id)
      .eq("distributor_id", me.distributor_id ?? "")
      .maybeSingle();
    if (!acct) return { error: "Invalid account" };
    update.account_id = parsed.data.account_id;
    effectiveAccountId = parsed.data.account_id;
  }

  if (parsed.data.decision === "decline") {
    update.fos_status = "declined";
  } else if (parsed.data.decision === "accept") {
    update.fos_status = "accepted";
    update.fos_amount = existing.requested_amount;
    finalAmount = Number(existing.requested_amount);
  } else {
    if (!parsed.data.amount) return { error: "Amount is required when editing" };
    update.fos_status = "edited";
    update.fos_amount = parsed.data.amount;
    finalAmount = parsed.data.amount;
  }

  // Auto-approve: FOS's decision also approves on the distributor's behalf.
  if (autoApprove && finalAmount !== null) {
    update.distributor_status = "approved";
    update.distributor_acted_at = now;
    update.distributor_notes = "Auto-approved per FOS authority";
    update.final_amount = finalAmount;
  }

  const { error } = await supabase
    .from("money_requests")
    .update(update)
    .eq("id", parsed.data.request_id)
    .eq("fos_id", me.id);
  if (error) return { error: error.message };

  if (autoApprove && finalAmount !== null) {
    await admin.rpc("recompute_balances", {
      p_retailer_id: existing.retailer_id,
      p_account_id: effectiveAccountId,
      p_from_date: now.slice(0, 10),
    });
  }

  revalidatePath("/fos/inbox");
  revalidatePath("/distributor/approvals");
  if (autoApprove) {
    revalidatePath("/distributor/outstanding");
    revalidatePath("/distributor");
    revalidatePath("/retailer");
    revalidatePath("/retailer/history");
  }
  return { ok: true };
}

export async function distributorDecideRequest(formData: FormData): Promise<Result> {
  const me = await requireRole("distributor");
  const parsed = DistributorRequestDecisionSchema.safeParse({
    request_id: formData.get("request_id"),
    decision: formData.get("decision"),
    amount: formData.get("amount") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: req, error: readErr } = await supabase
    .from("money_requests")
    .select("retailer_id, account_id, fos_status, requested_amount")
    .eq("id", parsed.data.request_id)
    .eq("distributor_id", me.id)
    .single();
  if (readErr || !req) return { error: "Request not found" };

  const actedAt = new Date().toISOString();
  const approving = parsed.data.decision === "approve";
  const updatePayload: Record<string, unknown> = {
    distributor_status: approving ? "approved" : "declined",
    distributor_acted_at: actedAt,
    distributor_notes: parsed.data.notes || null,
  };
  if (approving && parsed.data.amount !== undefined) {
    updatePayload.final_amount = parsed.data.amount;
  }

  // Override: if the FOS never acted, the distributor's decision settles the
  // FOS stage too, so the request leaves the FOS inbox and records cleanly.
  if (req.fos_status === "pending") {
    updatePayload.fos_status = approving ? "accepted" : "declined";
    updatePayload.fos_acted_at = actedAt;
    if (approving && updatePayload.final_amount === undefined) {
      updatePayload.final_amount = Number(req.requested_amount);
    }
    if (approving && updatePayload.fos_amount === undefined) {
      updatePayload.fos_amount =
        (updatePayload.final_amount as number) ?? Number(req.requested_amount);
    }
    const existingNote = (parsed.data.notes || "").trim();
    updatePayload.distributor_notes = existingNote
      ? `Actioned directly by distributor — ${existingNote}`
      : "Actioned directly by distributor (FOS had not responded)";
  }

  const { error } = await supabase
    .from("money_requests")
    .update(updatePayload)
    .eq("id", parsed.data.request_id)
    .eq("distributor_id", me.id);
  if (error) return { error: error.message };

  if (parsed.data.decision === "approve") {
    await admin.rpc("recompute_balances", {
      p_retailer_id: req.retailer_id,
      p_account_id: req.account_id,
      p_from_date: actedAt.slice(0, 10),
    });
  }

  revalidatePath("/distributor/approvals");
  revalidatePath("/distributor/outstanding");
  revalidatePath("/distributor");
  revalidatePath("/fos/inbox");
  return { ok: true };
}
