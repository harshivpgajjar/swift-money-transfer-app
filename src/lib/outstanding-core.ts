import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdjustResult = { ok: true } | { error: string };

/* "Edit outstanding" = append a ledger adjustment (approved credit for an
   increase, approved cash for a decrease). Direct balance edits would be
   wiped by the next recompute; this survives and stays auditable. */
export async function adjustOutstandingCore(args: {
  distributorId: string;
  retailerId: string;
  accountId: string;
  target: number;
  note?: string;
}): Promise<AdjustResult> {
  const { distributorId, retailerId, accountId, target } = args;
  const note = (args.note ?? "").trim();
  if (!retailerId || !accountId) return { error: "Missing retailer or account" };
  if (!Number.isFinite(target)) return { error: "Enter the new outstanding amount" };

  const admin = createAdminClient();
  const { data: retailer } = await admin
    .from("profiles")
    .select("id, fos_id, distributor_id, role")
    .eq("id", retailerId)
    .eq("distributor_id", distributorId)
    .eq("role", "retailer")
    .maybeSingle();
  if (!retailer) return { error: "Retailer not found" };

  const { data: balances } = await admin
    .from("daily_balances")
    .select("closing, balance_date")
    .eq("retailer_id", retailerId)
    .eq("account_id", accountId)
    .order("balance_date", { ascending: false })
    .limit(1);
  const current = Number(balances?.[0]?.closing ?? 0);
  const delta = Math.round((target - current) * 100) / 100;
  if (Math.abs(delta) < 0.005) return { error: "no_change" };

  const now = new Date();
  const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const fullNote = note
    ? `Manual adjustment by distributor — ${note}`
    : "Manual adjustment by distributor";

  if (delta > 0) {
    const { error } = await admin.from("money_requests").insert({
      retailer_id: retailerId,
      fos_id: retailer.fos_id ?? distributorId,
      distributor_id: distributorId,
      account_id: accountId,
      requested_amount: delta,
      fos_amount: delta,
      final_amount: delta,
      fos_status: "accepted",
      distributor_status: "approved",
      fos_acted_at: now.toISOString(),
      distributor_acted_at: now.toISOString(),
      fos_notes: fullNote,
      distributor_notes: fullNote,
    });
    if (error) return { error: error.message };
  } else {
    const { error } = await admin.from("cash_submissions").insert({
      retailer_id: retailerId,
      submitted_by: distributorId,
      distributor_id: distributorId,
      account_id: accountId,
      amount: -delta,
      approved_amount: -delta,
      txn_date: today,
      status: "approved",
      approved_by: distributorId,
      approved_at: now.toISOString(),
      notes: fullNote,
    });
    if (error) return { error: error.message };
  }

  await admin.rpc("recompute_balances", {
    p_retailer_id: retailerId,
    p_account_id: accountId,
    p_from_date: today,
  });
  return { ok: true };
}
