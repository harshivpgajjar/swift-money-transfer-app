import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccountsForDistributor } from "@/lib/accounts";
import FosCashForm from "./fos-cash-form";

export default async function FosCashPage() {
  const me = await requireRole("fos");
  if (!me.distributor_id) return null;

  const supabase = await createClient();
  const accounts = await getAccountsForDistributor(me.distributor_id);

  const { data: retailers } = await supabase
    .from("profiles")
    .select("id, retailer_code, full_name")
    .eq("fos_id", me.id)
    .eq("role", "retailer")
    .eq("active", true)
    .order("retailer_code");

  const ids = (retailers ?? []).map((r) => r.id);
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
    <FosCashForm
      accounts={accounts.map((a) => ({ id: a.id, slug: a.slug, name: a.name }))}
      retailers={(retailers ?? []).map((r) => ({
        id: r.id,
        name: r.full_name,
        code: r.retailer_code ?? "",
        outstanding: outstanding[r.id] ?? {},
      }))}
    />
  );
}
