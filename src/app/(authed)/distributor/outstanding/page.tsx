import { requireRole } from "@/lib/auth";
import { getRetailerSummaries } from "@/lib/queries";
import { getAccounts } from "@/lib/accounts";
import OutstandingView from "./outstanding-view";

export default async function OutstandingPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const me = await requireRole("distributor");
  const accounts = await getAccounts(me.id);
  if (accounts.length === 0) return null;

  const sp = await searchParams;
  const active = accounts.find((a) => a.slug === sp.account) ?? accounts[0];
  const summaries = await getRetailerSummaries(me.id, active.id);

  return (
    <OutstandingView
      accounts={accounts.map((a) => ({ id: a.id, slug: a.slug, name: a.name }))}
      activeSlug={active.slug}
      activeName={active.name}
      accountId={active.id}
      rows={summaries.map((s) => ({
        id: s.id,
        code: s.retailer_code ?? "",
        name: s.full_name,
        fos: s.fos_name,
        needsFos: s.needs_assignment,
        inactive: !s.active,
        transferred: s.total_transferred,
        reversed: s.total_reversed,
        cash: s.total_cash,
        outstanding: s.outstanding,
      }))}
    />
  );
}
