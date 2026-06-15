import { supabase } from "./supabase";

type Result = { ok: true } | { error: string };

export async function createMoneyRequest(args: {
  retailerId: string;
  fosId: string;
  distributorId: string;
  accountId: string;
  amount: number;
  notes?: string;
}): Promise<Result> {
  const { error } = await supabase.from("money_requests").insert({
    retailer_id: args.retailerId,
    fos_id: args.fosId,
    distributor_id: args.distributorId,
    account_id: args.accountId,
    requested_amount: args.amount,
    fos_notes: args.notes || null,
  });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function fosReviewRequest(args: {
  requestId: string;
  decision: "accept" | "edit" | "decline";
  amount?: number;
  notes?: string;
  requestedAmount: number;
  autoApprove?: boolean;
  accountId?: string;
}): Promise<Result> {
  const now = new Date().toISOString();
  let finalAmount: number | null = null;

  const update: Record<string, unknown> = {
    fos_acted_at: now,
    fos_notes: args.notes || null,
  };

  if (args.decision === "decline") {
    update.fos_status = "declined";
  } else if (args.decision === "accept") {
    update.fos_status = "accepted";
    update.fos_amount = args.requestedAmount;
    finalAmount = args.requestedAmount;
  } else {
    if (!args.amount) return { error: "Amount required" };
    update.fos_status = "edited";
    update.fos_amount = args.amount;
    finalAmount = args.amount;
  }

  if (args.autoApprove && finalAmount !== null) {
    update.distributor_status = "approved";
    update.distributor_acted_at = now;
    update.distributor_notes = "Auto-approved per FOS authority";
    update.final_amount = finalAmount;
  }

  // We need the request row to compare a changed account and for the
  // retailer/account recompute on auto-approve.
  let retailerId: string | null = null;
  let accountId: string | null = null;
  const mayChangeAccount = !!args.accountId && args.decision !== "decline";
  if ((args.autoApprove && finalAmount !== null) || mayChangeAccount) {
    const { data: req } = await supabase
      .from("money_requests")
      .select("retailer_id, account_id")
      .eq("id", args.requestId)
      .single();
    retailerId = req?.retailer_id ?? null;
    accountId = req?.account_id ?? null;
  }

  // The FOS may move the request to a different account.
  if (mayChangeAccount && args.accountId !== accountId) {
    update.account_id = args.accountId;
    accountId = args.accountId!;
  }

  const { error } = await supabase
    .from("money_requests")
    .update(update)
    .eq("id", args.requestId);
  if (error) return { error: error.message };

  if (args.autoApprove && finalAmount !== null && retailerId && accountId) {
    // Recompute on the effective (possibly new) account.
    await supabase.rpc("recompute_balances", {
      p_retailer_id: retailerId,
      p_account_id: accountId,
      p_from_date: now.slice(0, 10),
    });
  }
  return { ok: true };
}

export async function distributorDecideRequest(args: {
  requestId: string;
  decision: "approve" | "decline";
  amount?: number;
  notes?: string;
}): Promise<Result> {
  const { data: req, error: readErr } = await supabase
    .from("money_requests")
    .select("retailer_id, account_id, fos_status, requested_amount")
    .eq("id", args.requestId)
    .single();
  if (readErr || !req) return { error: readErr?.message ?? "Not found" };

  const actedAt = new Date().toISOString();
  const approving = args.decision === "approve";
  const update: Record<string, unknown> = {
    distributor_status: approving ? "approved" : "declined",
    distributor_acted_at: actedAt,
    distributor_notes: args.notes || null,
  };
  if (approving && args.amount !== undefined) {
    update.final_amount = args.amount;
  }

  // Override: distributor acting on a request the FOS hasn't decided settles
  // the FOS stage too, so it clears the FOS inbox and records cleanly.
  if (req.fos_status === "pending") {
    update.fos_status = approving ? "accepted" : "declined";
    update.fos_acted_at = actedAt;
    if (approving) {
      const finalAmt = args.amount ?? Number(req.requested_amount);
      update.final_amount = finalAmt;
      update.fos_amount = finalAmt;
    }
    update.distributor_notes = args.notes
      ? `Actioned directly by distributor — ${args.notes}`
      : "Actioned directly by distributor (FOS had not responded)";
  }

  const { error } = await supabase
    .from("money_requests")
    .update(update)
    .eq("id", args.requestId);
  if (error) return { error: error.message };

  if (args.decision === "approve") {
    await supabase.rpc("recompute_balances", {
      p_retailer_id: req.retailer_id,
      p_account_id: req.account_id,
      p_from_date: actedAt.slice(0, 10),
    });
  }
  return { ok: true };
}

export async function retailerSubmitCash(args: {
  retailerId: string;
  distributorId: string;
  accountId: string;
  amount: number;
  txnDate?: string;
  notes?: string;
}): Promise<Result> {
  const { error } = await supabase.from("cash_submissions").insert({
    retailer_id: args.retailerId,
    submitted_by: args.retailerId,
    distributor_id: args.distributorId,
    account_id: args.accountId,
    amount: args.amount,
    txn_date: args.txnDate ?? new Date().toISOString().slice(0, 10),
    notes: args.notes || null,
  });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function fosSubmitCash(args: {
  retailerId: string;
  fosId: string;
  distributorId: string;
  accountId: string;
  amount: number;
  txnDate?: string;
  notes?: string;
}): Promise<Result> {
  const txnDate = args.txnDate ?? new Date().toISOString().slice(0, 10);
  // The FOS is the cash authority — their own submission is approved on entry.
  const { error } = await supabase.from("cash_submissions").insert({
    retailer_id: args.retailerId,
    submitted_by: args.fosId,
    distributor_id: args.distributorId,
    account_id: args.accountId,
    amount: args.amount,
    approved_amount: args.amount,
    txn_date: txnDate,
    status: "approved",
    approved_by: args.fosId,
    approved_at: new Date().toISOString(),
    notes: args.notes || null,
  });
  if (error) return { error: error.message };

  // recompute_balances is security definer — RPC works under user JWT.
  await supabase.rpc("recompute_balances", {
    p_retailer_id: args.retailerId,
    p_account_id: args.accountId,
    p_from_date: txnDate,
  });
  return { ok: true };
}

/* Cash submitted by retailers is decided by their FOS. */
export async function fosDecideCash(args: {
  cashId: string;
  decision: "approve" | "decline";
  amount?: number;
  notes?: string;
  fosId: string;
}): Promise<Result> {
  const { data: cash, error: readErr } = await supabase
    .from("cash_submissions")
    .select("id, retailer_id, account_id, txn_date, status")
    .eq("id", args.cashId)
    .single();
  if (readErr || !cash) return { error: readErr?.message ?? "Cash submission not found" };
  if (cash.status !== "pending") return { error: "Already decided" };

  const status = args.decision === "approve" ? "approved" : "declined";
  const update: Record<string, unknown> = {
    status,
    approved_by: args.fosId,
    approved_at: new Date().toISOString(),
    notes: args.notes || null,
  };
  if (status === "approved" && args.amount !== undefined) {
    update.approved_amount = args.amount;
  }

  // RLS (cash_fos_update) enforces the retailer→FOS assignment.
  const { error: updateErr } = await supabase
    .from("cash_submissions")
    .update(update)
    .eq("id", cash.id);
  if (updateErr) return { error: updateErr.message };

  if (status === "approved") {
    await supabase.rpc("recompute_balances", {
      p_retailer_id: cash.retailer_id,
      p_account_id: cash.account_id,
      p_from_date: cash.txn_date,
    });
  }
  return { ok: true };
}

/* Combined payment: one amount split across accounts. The account with the
   LOWER due gets cleared first; any leftover lands on the largest due. */
export async function retailerSubmitCashCombined(args: {
  retailerId: string;
  distributorId: string;
  amount: number;
  txnDate?: string;
  notes?: string;
  accounts: { id: string; outstanding: number }[];
}): Promise<Result> {
  if (!Number.isFinite(args.amount) || args.amount <= 0) {
    return { error: "Enter the cash amount." };
  }
  if (!args.accounts.length) return { error: "No accounts configured" };

  const withDue = args.accounts
    .filter((a) => a.outstanding > 0)
    .sort((a, b) => a.outstanding - b.outstanding); // lower balance clears first

  const allocations: { account_id: string; amount: number }[] = [];
  let remaining = args.amount;
  for (const a of withDue) {
    if (remaining <= 0) break;
    const pay = Math.min(remaining, a.outstanding);
    allocations.push({ account_id: a.id, amount: pay });
    remaining -= pay;
  }
  if (remaining > 0) {
    // Overpayment: park the excess on the largest due (or the first account).
    const targetId = withDue.length
      ? withDue[withDue.length - 1].id
      : args.accounts[0].id;
    const existing = allocations.find((x) => x.account_id === targetId);
    if (existing) existing.amount += remaining;
    else allocations.push({ account_id: targetId, amount: remaining });
  }

  const splitNote = args.notes ? `${args.notes} · Combined payment` : "Combined payment";
  const txnDate = args.txnDate ?? new Date().toISOString().slice(0, 10);
  const rows = allocations.map((al) => ({
    retailer_id: args.retailerId,
    submitted_by: args.retailerId,
    distributor_id: args.distributorId,
    account_id: al.account_id,
    amount: al.amount,
    txn_date: txnDate,
    notes: splitNote,
  }));
  const { error } = await supabase.from("cash_submissions").insert(rows);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function distributorDecideCash(args: {
  cashId: string;
  decision: "approve" | "decline";
  amount?: number;
  notes?: string;
}): Promise<Result> {
  const status = args.decision === "approve" ? "approved" : "declined";

  const { data: cash, error: readErr } = await supabase
    .from("cash_submissions")
    .select("retailer_id, account_id, txn_date")
    .eq("id", args.cashId)
    .single();
  if (readErr || !cash) return { error: readErr?.message ?? "Not found" };

  const update: Record<string, unknown> = {
    status,
    approved_at: new Date().toISOString(),
    notes: args.notes || null,
  };
  if (status === "approved" && args.amount !== undefined) {
    update.approved_amount = args.amount;
  }

  const { error: updateErr } = await supabase
    .from("cash_submissions")
    .update(update)
    .eq("id", args.cashId);
  if (updateErr) return { error: updateErr.message };

  if (status === "approved") {
    // recompute_balances is security definer — RPC works under user JWT.
    await supabase.rpc("recompute_balances", {
      p_retailer_id: cash.retailer_id,
      p_account_id: cash.account_id,
      p_from_date: cash.txn_date,
    });
  }
  return { ok: true };
}
