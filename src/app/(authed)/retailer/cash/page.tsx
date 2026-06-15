import { requireRole } from "@/lib/auth";
import { getRetailerLatestClosingPerAccount } from "@/lib/queries";
import { getAccountsForDistributor } from "@/lib/accounts";
import RetailerCashForm from "./retailer-cash-form";

export default async function RetailerCashPage() {
  const me = await requireRole("retailer");
  if (!me.distributor_id) return null;

  const accounts = await getAccountsForDistributor(me.distributor_id);
  const balanceMap = await getRetailerLatestClosingPerAccount(me.id);

  return (
    <RetailerCashForm
      accounts={accounts.map((a) => ({
        id: a.id,
        slug: a.slug,
        name: a.name,
        outstanding: balanceMap.get(a.id) ?? 0,
      }))}
    />
  );
}
