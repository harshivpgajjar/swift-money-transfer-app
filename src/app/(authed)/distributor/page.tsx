import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDistributorAnalytics } from "@/lib/analytics";
import DistributorHomeView from "./home-view";
import AnalyticsView from "./analytics-view";

export default async function DistributorHome() {
  const me = await requireRole("distributor");
  const supabase = await createClient();

  const [pendingRequests, pendingCash, retailerCount, fosCount, needsAssignment, outRes, personalRes] =
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
        .eq("role", "retailer")
        .eq("excluded", false)
        .eq("personal", false),
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
      // Server-side latest-balance sum — immune to the 1000-row fetch cap.
      supabase.rpc("org_outstanding", { p_distributor: me.id }),
      supabase.rpc("org_personal_outstanding", { p_distributor: me.id }),
    ]);

  const total = Number(outRes.data ?? 0);
  const personalTotal = Number(personalRes.data ?? 0);

  const analytics = await getDistributorAnalytics(me.id);

  return (
    <DistributorHomeView
      totalOutstanding={total}
      personalOutstanding={personalTotal}
      pendingRequests={pendingRequests.count ?? 0}
      pendingCash={pendingCash.count ?? 0}
      retailers={retailerCount.count ?? 0}
      fos={fosCount.count ?? 0}
      needsAssignment={needsAssignment.count ?? 0}
      analytics={<AnalyticsView data={analytics} />}
    />
  );
}
