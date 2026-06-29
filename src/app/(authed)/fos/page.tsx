import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import FosHomeView from "./home-view";

export default async function FosHome() {
  const me = await requireRole("fos");
  const supabase = await createClient();

  const [pendingInbox, retailers, outRes] = await Promise.all([
    supabase
      .from("money_requests")
      .select("id", { count: "exact", head: true })
      .eq("fos_id", me.id)
      .eq("fos_status", "pending"),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("fos_id", me.id)
      .eq("role", "retailer")
      .eq("excluded", false),
    // Server-side latest-balance sum scoped to this FOS — no 1000-row cap.
    supabase.rpc("org_outstanding", { p_distributor: me.distributor_id, p_fos: me.id }),
  ]);

  const total = Number(outRes.data ?? 0);

  return (
    <FosHomeView
      totalOutstanding={total}
      retailerCount={retailers.count ?? 0}
      inboxCount={pendingInbox.count ?? 0}
      autoApprove={me.fos_auto_approve === true}
    />
  );
}
