import { requireRole } from "@/lib/auth";
import { getAccounts } from "@/lib/accounts";
import { getCashReportReconciliation, getEodReconciliation, getEodTransactions } from "@/lib/queries";
import ReportsView from "./reports-view";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; tab?: string }>;
}) {
  const me = await requireRole("distributor");
  const accounts = await getAccounts(me.id);
  if (accounts.length === 0) return null;

  const sp = await searchParams;
  const active = accounts.find((a) => a.slug === sp.account) ?? accounts[0];
  const [recon, eodTxns, eodRecon] = await Promise.all([
    getCashReportReconciliation(me.id, active.id),
    getEodTransactions(me.id, active.id),
    getEodReconciliation(me.id, active.id),
  ]);

  return (
    <ReportsView
      initialTab={sp.tab === "cash" ? "cash" : "eod"}
      accounts={accounts.map((a) => ({ id: a.id, slug: a.slug, name: a.name }))}
      activeSlug={active.slug}
      eodRecon={eodRecon.map((x) => ({
        date: x.date,
        code: x.code,
        name: x.name,
        file: x.file,
        app: x.app,
      }))}
      eodTxns={eodTxns.map((x) => ({
        date: x.txn_date,
        retailer: x.retailer?.full_name ?? "?",
        code: x.retailer?.retailer_code ?? "",
        type: x.type,
        amount: Number(x.amount),
        ref: x.bank_reference ?? "",
      }))}
      recon={recon.map((r) => ({
        date: r.txn_date,
        code: r.retailer_code ?? "",
        name: r.full_name,
        book: r.book_amount,
        system: r.system_amount,
      }))}
    />
  );
}
