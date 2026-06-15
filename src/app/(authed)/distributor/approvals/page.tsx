import { requireRole } from "@/lib/auth";
import {
  getDistributorCashHistory,
  getDistributorFosPendingRequests,
  getDistributorPendingRequests,
} from "@/lib/queries";
import ApprovalsView from "./approvals-view";

export default async function ApprovalsPage() {
  const me = await requireRole("distributor");
  const [requests, fosPending, cashHistory] = await Promise.all([
    getDistributorPendingRequests(me.id),
    getDistributorFosPendingRequests(me.id),
    getDistributorCashHistory(me.id),
  ]);

  return (
    <ApprovalsView
      requests={requests.map((r) => ({
        id: r.id,
        retailerName: r.retailer?.full_name ?? "?",
        retailerCode: r.retailer?.retailer_code ?? "",
        account: r.account?.name ?? "",
        fosEdited: r.fos_status === "edited",
        fosName: r.fos?.full_name ?? "—",
        submitted: r.fos_acted_at ?? r.created_at,
        amount: Number(r.fos_amount ?? r.requested_amount),
        requested: Number(r.requested_amount),
        note: r.fos_notes,
      }))}
      fosPending={fosPending.map((r) => ({
        id: r.id,
        retailerName: r.retailer?.full_name ?? "?",
        retailerCode: r.retailer?.retailer_code ?? "",
        account: r.account?.name ?? "",
        fosEdited: false,
        fosName: r.fos?.full_name ?? "—",
        submitted: r.created_at,
        amount: Number(r.requested_amount),
        requested: Number(r.requested_amount),
        note: r.fos_notes,
        awaitingFos: true,
      }))}
      cashHistory={cashHistory.map((c) => ({
        id: c.id,
        retailerName: c.retailer?.full_name ?? "?",
        retailerCode: c.retailer?.retailer_code ?? "",
        account: c.account?.name ?? "",
        by: `${c.submitter?.full_name ?? "—"} (${c.submitter?.role ?? "?"})`,
        amount: Number(c.approved_amount ?? c.amount),
        txn: c.txn_date,
        submitted: c.created_at,
        status: c.status,
      }))}
    />
  );
}
