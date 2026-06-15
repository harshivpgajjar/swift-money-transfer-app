import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccountsForDistributor } from "@/lib/accounts";
import RetailersView from "./retailers-view";

export default async function FosRetailersPage() {
  const me = await requireRole("fos");
  if (!me.distributor_id) return null;
  const supabase = await createClient();

  const [accounts, retailersRes] = await Promise.all([
    getAccountsForDistributor(me.distributor_id),
    supabase
      .from("profiles")
      .select("id, retailer_code, full_name, phone, active")
      .eq("fos_id", me.id)
      .eq("role", "retailer")
      .order("retailer_code"),
  ]);

  const retailers = retailersRes.data ?? [];
  const ids = retailers.map((r) => r.id);
  const outstanding: Record<string, Record<string, number>> = {};
  if (ids.length) {
    const { data: balances } = await supabase
      .from("daily_balances")
      .select("retailer_id, account_id, balance_date, closing")
      .in("retailer_id", ids)
      .order("balance_date", { ascending: false });
    const seen = new Set<string>();
    for (const b of balances ?? []) {
      const key = `${b.retailer_id}|${b.account_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      (outstanding[b.retailer_id] ??= {})[b.account_id] = Number(b.closing);
    }
  }

  return (
    <RetailersView
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      retailers={retailers.map((r) => ({
        id: r.id,
        name: r.full_name,
        code: r.retailer_code ?? "",
        phone: r.phone,
        active: r.active,
        outstanding: outstanding[r.id] ?? {},
      }))}
    />
  );
}
