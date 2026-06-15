import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccountsForDistributor } from "@/lib/accounts";
import { getRetailerLatestClosingPerAccount } from "@/lib/queries";
import RetailerHomeView from "./home-view";

export default async function RetailerHome() {
  const me = await requireRole("retailer");
  const supabase = await createClient();

  const accounts = me.distributor_id
    ? await getAccountsForDistributor(me.distributor_id)
    : [];

  const [balanceMap, pendingRequests, pendingCash, fos] = await Promise.all([
    getRetailerLatestClosingPerAccount(me.id),
    supabase
      .from("money_requests")
      .select("id", { count: "exact", head: true })
      .eq("retailer_id", me.id)
      .eq("distributor_status", "pending")
      .in("fos_status", ["pending", "accepted", "edited"]),
    supabase
      .from("cash_submissions")
      .select("id", { count: "exact", head: true })
      .eq("retailer_id", me.id)
      .eq("status", "pending"),
    me.fos_id
      ? supabase.from("profiles").select("full_name, phone").eq("id", me.fos_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return (
    <RetailerHomeView
      accounts={accounts.map((a) => ({
        id: a.id,
        slug: a.slug,
        name: a.name,
        outstanding: balanceMap.get(a.id) ?? 0,
      }))}
      pendingRequests={pendingRequests.count ?? 0}
      pendingCash={pendingCash.count ?? 0}
      fosName={fos.data?.full_name ?? null}
      fosPhone={fos.data?.phone ?? null}
    />
  );
}
