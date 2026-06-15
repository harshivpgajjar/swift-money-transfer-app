"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import {
  CashDecisionSchema,
  NewCashSubmissionSchema,
  RetailerCashSubmissionSchema,
} from "@/lib/zod-schemas";

type Result = { ok: true } | { error: string };

export async function retailerSubmitCash(formData: FormData): Promise<Result> {
  const me = await requireRole("retailer");
  if (!me.distributor_id) return { error: "Profile is missing distributor link." };

  const parsed = RetailerCashSubmissionSchema.safeParse({
    account_id: formData.get("account_id"),
    amount: formData.get("amount"),
    txn_date: formData.get("txn_date") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("cash_submissions").insert({
    retailer_id: me.id,
    submitted_by: me.id,
    distributor_id: me.distributor_id,
    account_id: parsed.data.account_id,
    amount: parsed.data.amount,
    txn_date: parsed.data.txn_date ?? new Date().toISOString().slice(0, 10),
    notes: parsed.data.notes || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/retailer");
  revalidatePath("/retailer/history");
  revalidatePath("/distributor/approvals");
  return { ok: true };
}

export async function fosSubmitCash(formData: FormData): Promise<Result> {
  const me = await requireRole("fos");
  if (!me.distributor_id) return { error: "Profile is missing distributor link." };

  const parsed = NewCashSubmissionSchema.safeParse({
    retailer_id: formData.get("retailer_id"),
    account_id: formData.get("account_id"),
    amount: formData.get("amount"),
    txn_date: formData.get("txn_date") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Verify the retailer is assigned to this FOS
  const supabase = await createClient();
  const { data: retailer, error: rErr } = await supabase
    .from("profiles")
    .select("id, role, fos_id, distributor_id")
    .eq("id", parsed.data.retailer_id)
    .single();
  if (rErr || !retailer) return { error: "Retailer not found" };
  if (retailer.role !== "retailer" || retailer.fos_id !== me.id) {
    return { error: "Retailer is not assigned to you" };
  }

  const txnDate = parsed.data.txn_date ?? new Date().toISOString().slice(0, 10);
  // The FOS is the cash approver, so their own submission is approved on entry.
  const { error } = await supabase.from("cash_submissions").insert({
    retailer_id: parsed.data.retailer_id,
    submitted_by: me.id,
    distributor_id: retailer.distributor_id ?? me.distributor_id,
    account_id: parsed.data.account_id,
    amount: parsed.data.amount,
    approved_amount: parsed.data.amount,
    txn_date: txnDate,
    status: "approved",
    approved_by: me.id,
    approved_at: new Date().toISOString(),
    notes: parsed.data.notes || null,
  });
  if (error) return { error: error.message };

  const admin = createAdminClient();
  await admin.rpc("recompute_balances", {
    p_retailer_id: parsed.data.retailer_id,
    p_account_id: parsed.data.account_id,
    p_from_date: txnDate,
  });

  revalidatePath("/fos");
  revalidatePath("/fos/cash");
  revalidatePath("/retailer");
  return { ok: true };
}

/* Cash submitted by retailers is decided by their FOS. */
export async function fosDecideCash(formData: FormData): Promise<Result> {
  const me = await requireRole("fos");
  const parsed = CashDecisionSchema.safeParse({
    cash_id: formData.get("cash_id"),
    decision: formData.get("decision"),
    amount: formData.get("amount") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: cash, error: cashErr } = await supabase
    .from("cash_submissions")
    .select("id, retailer_id, account_id, txn_date, status, retailer:retailer_id(fos_id)")
    .eq("id", parsed.data.cash_id)
    .single();
  if (cashErr || !cash) return { error: "Cash submission not found" };
  if (cash.status !== "pending") return { error: "Already decided" };
  const retailer = cash.retailer as unknown as { fos_id: string | null } | null;
  if (retailer?.fos_id !== me.id) return { error: "Retailer is not assigned to you" };

  const status = parsed.data.decision === "approve" ? "approved" : "declined";
  const update: Record<string, unknown> = {
    status,
    approved_by: me.id,
    approved_at: new Date().toISOString(),
    notes: parsed.data.notes || null,
  };
  if (status === "approved" && parsed.data.amount !== undefined) {
    update.approved_amount = parsed.data.amount;
  }

  const { error: updateErr } = await supabase
    .from("cash_submissions")
    .update(update)
    .eq("id", cash.id);
  if (updateErr) return { error: updateErr.message };

  if (status === "approved") {
    await admin.rpc("recompute_balances", {
      p_retailer_id: cash.retailer_id,
      p_account_id: cash.account_id,
      p_from_date: cash.txn_date,
    });
  }

  revalidatePath("/fos/inbox");
  revalidatePath("/fos");
  revalidatePath("/retailer");
  revalidatePath("/distributor/outstanding");
  return { ok: true };
}

/* Combined payment: one amount split across accounts. The account with the
   LOWER due gets cleared first; any leftover lands on the largest due. */
export async function retailerSubmitCashCombined(formData: FormData): Promise<Result> {
  const me = await requireRole("retailer");
  if (!me.distributor_id) return { error: "Profile is missing distributor link." };

  const amount = Number(formData.get("amount"));
  const txnDate =
    String(formData.get("txn_date") || "") || new Date().toISOString().slice(0, 10);
  const notes = String(formData.get("notes") || "");
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the cash amount." };

  const supabase = await createClient();
  const admin = createAdminClient();

  // Latest closing per active account, server-side (authoritative).
  const { data: accounts } = await admin
    .from("accounts")
    .select("id, name")
    .eq("distributor_id", me.distributor_id)
    .eq("active", true)
    .order("display_order", { ascending: true });
  if (!accounts?.length) return { error: "No accounts configured" };

  const { data: balances } = await supabase
    .from("daily_balances")
    .select("account_id, balance_date, closing")
    .eq("retailer_id", me.id)
    .order("balance_date", { ascending: false });
  const latest = new Map<string, number>();
  for (const b of balances ?? []) {
    if (!latest.has(b.account_id)) latest.set(b.account_id, Number(b.closing));
  }

  const withDue = accounts
    .map((a) => ({ ...a, due: latest.get(a.id) ?? 0 }))
    .filter((a) => a.due > 0)
    .sort((a, b) => a.due - b.due); // lower balance clears first

  const allocations: { account_id: string; amount: number }[] = [];
  let remaining = amount;
  for (const a of withDue) {
    if (remaining <= 0) break;
    const pay = Math.min(remaining, a.due);
    allocations.push({ account_id: a.id, amount: pay });
    remaining -= pay;
  }
  if (remaining > 0) {
    // Overpayment: park the excess on the largest due (or the first account).
    const targetId = withDue.length
      ? withDue[withDue.length - 1].id
      : accounts[0].id;
    const existing = allocations.find((x) => x.account_id === targetId);
    if (existing) existing.amount += remaining;
    else allocations.push({ account_id: targetId, amount: remaining });
  }

  const splitNote = notes ? `${notes} · Combined payment` : "Combined payment";
  const rows = allocations.map((al) => ({
    retailer_id: me.id,
    submitted_by: me.id,
    distributor_id: me.distributor_id,
    account_id: al.account_id,
    amount: al.amount,
    txn_date: txnDate,
    notes: splitNote,
  }));
  const { error } = await supabase.from("cash_submissions").insert(rows);
  if (error) return { error: error.message };

  revalidatePath("/retailer");
  revalidatePath("/retailer/history");
  revalidatePath("/fos/inbox");
  return { ok: true };
}

export async function distributorDecideCash(formData: FormData): Promise<Result> {
  const me = await requireRole("distributor");
  const parsed = CashDecisionSchema.safeParse({
    cash_id: formData.get("cash_id"),
    decision: formData.get("decision"),
    amount: formData.get("amount") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: cash, error: cashErr } = await supabase
    .from("cash_submissions")
    .select("id, retailer_id, account_id, txn_date, status")
    .eq("id", parsed.data.cash_id)
    .eq("distributor_id", me.id)
    .single();
  if (cashErr || !cash) return { error: "Cash submission not found" };
  if (cash.status !== "pending") return { error: "Already decided" };

  const status = parsed.data.decision === "approve" ? "approved" : "declined";
  const update: Record<string, unknown> = {
    status,
    approved_by: me.id,
    approved_at: new Date().toISOString(),
    notes: parsed.data.notes || null,
  };
  if (status === "approved" && parsed.data.amount !== undefined) {
    update.approved_amount = parsed.data.amount;
  }

  const { error: updateErr } = await supabase
    .from("cash_submissions")
    .update(update)
    .eq("id", cash.id);
  if (updateErr) return { error: updateErr.message };

  if (status === "approved") {
    await admin.rpc("recompute_balances", {
      p_retailer_id: cash.retailer_id,
      p_account_id: cash.account_id,
      p_from_date: cash.txn_date,
    });
  }

  revalidatePath("/distributor/approvals");
  revalidatePath("/distributor/outstanding");
  revalidatePath("/distributor");
  return { ok: true };
}
