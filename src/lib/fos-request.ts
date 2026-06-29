import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { FosBalanceRequestSchema } from "@/lib/zod-schemas";

type Input = {
  retailer_id?: unknown;
  account_id?: unknown;
  amount?: unknown;
  notes?: unknown;
};

/* Shared core for a FOS balance request — used by the web server action and the
   mobile API route. Validates ownership + defaulter, inserts an auto-approved
   request with the admin client (no FOS insert RLS policy), and posts it to the
   ledger via recompute_balances. Trusted: the caller must already be the FOS. */
export async function postFosBalanceRequest(
  fos: { id: string; distributor_id: string },
  raw: Input,
): Promise<{ ok: true } | { error: string }> {
  const parsed = FosBalanceRequestSchema.safeParse({
    retailer_id: raw.retailer_id,
    account_id: raw.account_id,
    amount: raw.amount,
    notes: raw.notes ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const admin = createAdminClient();

  const { data: retailer } = await admin
    .from("profiles")
    .select("id, fos_id, defaulted")
    .eq("id", parsed.data.retailer_id)
    .eq("role", "retailer")
    .maybeSingle();
  if (!retailer || retailer.fos_id !== fos.id) return { error: "Retailer not found" };
  if (retailer.defaulted)
    return { error: "Retailer is a defaulter — credit is blocked until the flag is cleared." };

  const { data: acct } = await admin
    .from("accounts")
    .select("id")
    .eq("id", parsed.data.account_id)
    .eq("distributor_id", fos.distributor_id)
    .maybeSingle();
  if (!acct) return { error: "Invalid account" };

  const now = new Date().toISOString();
  const { error } = await admin.from("money_requests").insert({
    retailer_id: parsed.data.retailer_id,
    fos_id: fos.id,
    distributor_id: fos.distributor_id,
    account_id: parsed.data.account_id,
    requested_amount: parsed.data.amount,
    fos_amount: parsed.data.amount,
    final_amount: parsed.data.amount,
    fos_status: "accepted",
    fos_acted_at: now,
    fos_notes: parsed.data.notes || null,
    distributor_status: "approved",
    distributor_acted_at: now,
    distributor_notes: "Auto-approved (FOS balance request)",
  });
  if (error) return { error: error.message };

  await admin.rpc("recompute_balances", {
    p_retailer_id: parsed.data.retailer_id,
    p_account_id: parsed.data.account_id,
    p_from_date: now.slice(0, 10),
  });

  return { ok: true };
}
