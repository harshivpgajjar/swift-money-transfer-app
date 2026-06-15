import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import FosHomeView from "./home-view";

export default async function FosHome() {
  const me = await requireRole("fos");
  const supabase = await createClient();

  const [pendingInbox, retailers, balances] = await Promise.all([
    supabase
      .from("money_requests")
      .select("id", { count: "exact", head: true })
      .eq("fos_id", me.id)
      .eq("fos_status", "pending"),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("fos_id", me.id)
      .eq("role", "retailer"),
    supabase
      .from("daily_balances")
      .select("retailer_id, account_id, balance_date, closing")
      .order("balance_date", { ascending: false }),
  ]);

  // latest closing per (retailer, account), summed
  const seen = new Set<string>();
  let total = 0;
  for (const b of balances.data ?? []) {
    const key = `${b.retailer_id}|${b.account_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total += Number(b.closing);
  }

  return (
    <FosHomeView
      totalOutstanding={total}
      retailerCount={retailers.count ?? 0}
      inboxCount={pendingInbox.count ?? 0}
      autoApprove={me.fos_auto_approve === true}
    />
  );
}
