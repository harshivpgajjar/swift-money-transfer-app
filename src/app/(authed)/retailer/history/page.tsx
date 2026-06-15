import { requireRole } from "@/lib/auth";
import { getRetailerDailyBalances, getRetailerHistory } from "@/lib/queries";
import { getAccountsForDistributor } from "@/lib/accounts";
import HistoryView from "./history-view";

export default async function RetailerHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const me = await requireRole("retailer");
  if (!me.distributor_id) return null;
  const accounts = await getAccountsForDistributor(me.distributor_id);
  if (accounts.length === 0) return null;

  const sp = await searchParams;
  const active = accounts.find((a) => a.slug === sp.account) ?? accounts[0];

  const [history, dailies] = await Promise.all([
    getRetailerHistory(me.id, active.id),
    getRetailerDailyBalances(me.id, active.id, 60),
  ]);

  return (
    <HistoryView
      accounts={accounts.map((a) => ({ id: a.id, slug: a.slug, name: a.name }))}
      activeSlug={active.slug}
      daily={dailies.map((d) => ({
        date: d.balance_date,
        opening: Number(d.opening),
        transferred: Number(d.transferred),
        reversed: Number(d.reversed),
        cash: Number(d.cash_received),
        closing: Number(d.closing),
      }))}
      requests={history.requests.map((r) => ({
        id: r.id,
        amount: Number(r.final_amount ?? r.fos_amount ?? r.requested_amount),
        requested: Number(r.requested_amount),
        adjusted:
          r.fos_amount !== null && Number(r.fos_amount) !== Number(r.requested_amount),
        createdAt: r.created_at,
        fosStatus: r.fos_status,
        distStatus: r.distributor_status,
      }))}
      cash={history.cash.map((c) => ({
        id: c.id,
        amount: Number(c.approved_amount ?? c.amount),
        txnDate: c.txn_date,
        createdAt: c.created_at,
        status: c.status,
      }))}
      eod={history.eod.map((e) => ({
        id: e.id,
        date: e.txn_date,
        type: e.type,
        amount: Number(e.amount),
        ref: e.bank_reference,
      }))}
    />
  );
}
