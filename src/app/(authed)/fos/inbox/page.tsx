import { requireRole } from "@/lib/auth";
import { getPendingFosCash, getRequestsForFos } from "@/lib/queries";
import { getAccountsForDistributor } from "@/lib/accounts";
import InboxView from "./inbox-view";

export default async function FosInboxPage() {
  const me = await requireRole("fos");
  const [pending, recent, pendingCash, accounts] = await Promise.all([
    getRequestsForFos(me.id, ["pending"]),
    getRequestsForFos(me.id, ["accepted", "edited", "declined"]),
    getPendingFosCash(me.id),
    me.distributor_id ? getAccountsForDistributor(me.distributor_id) : Promise.resolve([]),
  ]);

  return (
    <InboxView
      autoApprove={me.fos_auto_approve === true}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      pending={pending.map((r) => ({
        id: r.id,
        retailerName: r.retailer?.full_name ?? "?",
        retailerCode: r.retailer?.retailer_code ?? "",
        account: r.account?.name ?? "",
        accountId: r.account_id,
        requested: Number(r.requested_amount),
        submitted: r.created_at,
      }))}
      pendingCash={pendingCash.map((c) => ({
        id: c.id,
        retailerName: c.retailer?.full_name ?? "?",
        retailerCode: c.retailer?.retailer_code ?? "",
        account: c.account?.name ?? "",
        by: `${c.submitter?.full_name ?? "—"} (${c.submitter?.role ?? "?"})`,
        submitted: c.created_at,
        txn: c.txn_date,
        amount: Number(c.amount),
        note: c.notes,
      }))}
      recent={recent.slice(0, 20).map((r) => ({
        id: r.id,
        retailerName: r.retailer?.full_name ?? "?",
        retailerCode: r.retailer?.retailer_code ?? "",
        requested: Number(r.requested_amount),
        approved:
          r.fos_status === "declined"
            ? 0
            : Number(r.final_amount ?? r.fos_amount ?? r.requested_amount),
        fosStatus: r.fos_status,
        distStatus: r.distributor_status,
        when: r.fos_acted_at ?? r.created_at,
      }))}
    />
  );
}
