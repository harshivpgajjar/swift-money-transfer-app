import { requireRole } from "@/lib/auth";
import { getRetailerDailyBalances, getRetailerHistory, type DateRange } from "@/lib/queries";
import { getAccountsForDistributor } from "@/lib/accounts";
import { todayIso, isoAddDays } from "@/lib/format";
import HistoryView from "./history-view";

// Resolve the statement window from the URL. Default is the previous day only
// (light view); "all" loads the full history; "custom" honours from/to.
function resolveRange(sp: {
  range?: string;
  from?: string;
  to?: string;
}): { preset: string; range?: DateRange } {
  const today = todayIso();
  const yesterday = isoAddDays(today, -1);
  switch (sp.range) {
    case "all":
      return { preset: "all", range: undefined };
    case "7d":
      return { preset: "7d", range: { from: isoAddDays(today, -6), to: today } };
    case "30d":
      return { preset: "30d", range: { from: isoAddDays(today, -29), to: today } };
    case "custom":
      if (sp.from && sp.to) {
        const [from, to] = sp.from <= sp.to ? [sp.from, sp.to] : [sp.to, sp.from];
        return { preset: "custom", range: { from, to } };
      }
      return { preset: "1d", range: { from: yesterday, to: yesterday } };
    default:
      return { preset: "1d", range: { from: yesterday, to: yesterday } };
  }
}

export default async function RetailerHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; range?: string; from?: string; to?: string }>;
}) {
  const me = await requireRole("retailer");
  if (!me.distributor_id) return null;
  const accounts = await getAccountsForDistributor(me.distributor_id);
  if (accounts.length === 0) return null;

  const sp = await searchParams;
  const active = accounts.find((a) => a.slug === sp.account) ?? accounts[0];
  const { preset, range } = resolveRange(sp);

  const [history, dailies] = await Promise.all([
    getRetailerHistory(me.id, active.id, range),
    getRetailerDailyBalances(me.id, active.id, 60, range),
  ]);

  return (
    <HistoryView
      accounts={accounts.map((a) => ({ id: a.id, slug: a.slug, name: a.name }))}
      activeSlug={active.slug}
      preset={preset}
      from={range?.from ?? ""}
      to={range?.to ?? ""}
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
