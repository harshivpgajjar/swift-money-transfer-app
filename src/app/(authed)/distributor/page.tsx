import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDistributorAnalytics } from "@/lib/analytics";
import DistributorHomeView from "./home-view";
import AnalyticsView from "./analytics-view";

export default async function DistributorHome() {
  const me = await requireRole("distributor");
  const supabase = await createClient();

  const [pendingRequests, pendingCash, retailerCount, fosCount, needsAssignment, balances] =
    await Promise.all([
      supabase
        .from("money_requests")
        .select("id", { count: "exact", head: true })
        .eq("distributor_id", me.id)
        .eq("distributor_status", "pending")
        .in("fos_status", ["accepted", "edited"]),
      supabase
        .from("cash_submissions")
        .select("id", { count: "exact", head: true })
        .eq("distributor_id", me.id)
        .eq("status", "pending"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("distributor_id", me.id)
        .eq("role", "retailer"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("distributor_id", me.id)
        .eq("role", "fos"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("distributor_id", me.id)
        .eq("role", "retailer")
        .eq("needs_assignment", true),
      supabase
        .from("daily_balances")
        .select("retailer_id, account_id, balance_date, closing")
        .order("balance_date", { ascending: false }),
    ]);

  const seen = new Set<string>();
  let total = 0;
  for (const b of balances.data ?? []) {
    const key = `${b.retailer_id}|${b.account_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total += Number(b.closing);
  }

  const analytics = await getDistributorAnalytics(me.id);

  return (
    <DistributorHomeView
      totalOutstanding={total}
      pendingRequests={pendingRequests.count ?? 0}
      pendingCash={pendingCash.count ?? 0}
      retailers={retailerCount.count ?? 0}
      fos={fosCount.count ?? 0}
      needsAssignment={needsAssignment.count ?? 0}
      analytics={<AnalyticsView data={analytics} />}
    />
  );
}
