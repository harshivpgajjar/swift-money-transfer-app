import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAccountsForDistributor } from "@/lib/accounts";
import { getRetailerLatestClosingPerAccount } from "@/lib/queries";
import RequestForm from "./request-form";

export default async function RequestMoneyPage() {
  const me = await requireRole("retailer");
  const supabase = await createClient();

  const accounts = me.distributor_id
    ? await getAccountsForDistributor(me.distributor_id)
    : [];
  const balanceMap = await getRetailerLatestClosingPerAccount(me.id);

  let fosName: string | null = null;
  if (me.fos_id) {
    const { data } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", me.fos_id)
      .maybeSingle();
    fosName = data?.full_name ?? null;
  }

  return (
    <RequestForm
      accounts={accounts.map((a) => ({
        id: a.id,
        slug: a.slug,
        name: a.name,
        outstanding: balanceMap.get(a.id) ?? 0,
      }))}
      fosName={fosName}
    />
  );
}
