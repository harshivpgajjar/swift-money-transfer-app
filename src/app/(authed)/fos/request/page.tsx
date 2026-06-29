import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccountsForDistributor } from "@/lib/accounts";
import FosRequestForm from "./request-form";

export default async function FosRequestPage() {
  const me = await requireRole("fos");
  if (!me.distributor_id) return null;
  const supabase = await createClient();

  const [accounts, retailersRes] = await Promise.all([
    getAccountsForDistributor(me.distributor_id),
    supabase
      .from("profiles")
      .select("id, full_name, retailer_code")
      .eq("role", "retailer")
      .eq("fos_id", me.id)
      .eq("excluded", false)
      .eq("personal", false)
      .order("retailer_code"),
  ]);

  const retailers = retailersRes.data ?? [];
  const ids = retailers.map((r) => r.id);

  // Latest closing per (retailer, account) → drives the "outstanding after" preview.
  const balances: Record<string, Record<string, number>> = {};
  if (ids.length) {
    const { data } = await supabase
      .from("daily_balances")
      .select("retailer_id, account_id, closing, balance_date")
      .in("retailer_id", ids)
      .order("balance_date", { ascending: false });
    for (const b of data ?? []) {
      const r = (balances[b.retailer_id] ??= {});
      if (!(b.account_id in r)) r[b.account_id] = Number(b.closing);
    }
  }

  return (
    <FosRequestForm
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      retailers={retailers.map((r) => ({
        id: r.id,
        name: r.full_name,
        code: r.retailer_code,
      }))}
      balances={balances}
    />
  );
}
