import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  Profile,
  RequestFosStatus,
  ApprovalStatus,
  EodTxnType,
} from "@/lib/types";

export type RequestRow = {
  id: string;
  retailer_id: string;
  fos_id: string;
  distributor_id: string;
  account_id: string;
  requested_amount: string;
  fos_amount: string | null;
  final_amount: string | null;
  fos_status: RequestFosStatus;
  fos_acted_at: string | null;
  fos_notes: string | null;
  distributor_status: ApprovalStatus;
  distributor_acted_at: string | null;
  distributor_notes: string | null;
  created_at: string;
  retailer: { full_name: string; retailer_code: string | null } | null;
  fos: { full_name: string } | null;
  account: { name: string; slug: string } | null;
};

export type CashRow = {
  id: string;
  retailer_id: string;
  submitted_by: string;
  account_id: string;
  amount: string;
  approved_amount: string | null;
  txn_date: string;
  status: ApprovalStatus;
  notes: string | null;
  created_at: string;
  retailer: { full_name: string; retailer_code: string | null } | null;
  submitter: { full_name: string; role: Profile["role"] } | null;
  account: { name: string; slug: string } | null;
};

export type EodRow = {
  id: string;
  retailer_id: string;
  account_id: string;
  type: EodTxnType;
  amount: string;
  txn_date: string;
  bank_reference: string | null;
  notes: string | null;
  created_at: string;
};

export type RetailerSummary = {
  id: string;
  retailer_code: string | null;
  full_name: string;
  active: boolean;
  needs_assignment: boolean;
  fos_id: string | null;
  fos_name: string | null;
  total_transferred: number;
  total_reversed: number;
  total_cash: number;
  outstanding: number;
};

const REQUEST_SELECT = `
  id, retailer_id, fos_id, distributor_id, account_id,
  requested_amount, fos_amount, final_amount,
  fos_status, fos_acted_at, fos_notes,
  distributor_status, distributor_acted_at, distributor_notes, created_at,
  retailer:retailer_id(full_name, retailer_code),
  fos:fos_id(full_name),
  account:account_id(name, slug)
`;

const CASH_SELECT = `
  id, retailer_id, submitted_by, account_id,
  amount, approved_amount, txn_date, status, notes, created_at,
  retailer:retailer_id(full_name, retailer_code),
  submitter:submitted_by(full_name, role),
  account:account_id(name, slug)
`;

export async function getPendingFosInboxCount(fosId: string): Promise<number> {
  const supabase = await createClient();
  const [req, cash] = await Promise.all([
    supabase
      .from("money_requests")
      .select("id", { count: "exact", head: true })
      .eq("fos_id", fosId)
      .eq("fos_status", "pending"),
    supabase
      .from("cash_submissions")
      .select("id, retailer:retailer_id!inner(fos_id)", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("retailer.fos_id", fosId),
  ]);
  return (req.count ?? 0) + (cash.count ?? 0);
}

export async function getPendingApprovalsCount(distributorId: string): Promise<number> {
  // Cash approvals moved to the FOS — the distributor queue is requests only.
  const supabase = await createClient();
  const { count } = await supabase
    .from("money_requests")
    .select("id", { count: "exact", head: true })
    .eq("distributor_id", distributorId)
    .eq("distributor_status", "pending")
    .in("fos_status", ["accepted", "edited"]);
  return count ?? 0;
}

export async function getPendingFosCash(fosId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cash_submissions")
    .select(`id, retailer_id, submitted_by, account_id,
      amount, approved_amount, txn_date, status, notes, created_at,
      retailer:retailer_id!inner(full_name, retailer_code, fos_id),
      submitter:submitted_by(full_name, role),
      account:account_id(name, slug)`)
    .eq("status", "pending")
    .eq("retailer.fos_id", fosId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as CashRow[];
}

export async function getRequestsForFos(
  fosId: string,
  statusFilter?: RequestFosStatus[],
) {
  const supabase = await createClient();
  let q = supabase
    .from("money_requests")
    .select(REQUEST_SELECT)
    .eq("fos_id", fosId)
    .order("created_at", { ascending: false });

  if (statusFilter && statusFilter.length) q = q.in("fos_status", statusFilter);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as RequestRow[];
}

export async function getDistributorPendingRequests(distributorId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("money_requests")
    .select(REQUEST_SELECT)
    .eq("distributor_id", distributorId)
    .eq("distributor_status", "pending")
    .in("fos_status", ["accepted", "edited"])
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as RequestRow[];
}

/* Requests the FOS hasn't decided yet. Even with FOS auto-approve on, the
   distributor should see these and can act directly (override). */
export async function getDistributorFosPendingRequests(distributorId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("money_requests")
    .select(REQUEST_SELECT)
    .eq("distributor_id", distributorId)
    .eq("fos_status", "pending")
    .eq("distributor_status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as RequestRow[];
}

export async function getDistributorPendingCash(distributorId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cash_submissions")
    .select(CASH_SELECT)
    .eq("distributor_id", distributorId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as CashRow[];
}

export async function getDistributorCashHistory(distributorId: string, limit = 50) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cash_submissions")
    .select(CASH_SELECT)
    .eq("distributor_id", distributorId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as CashRow[];
}

export async function getRetailerHistory(retailerId: string, accountId?: string) {
  const supabase = await createClient();
  let reqQ = supabase
    .from("money_requests")
    .select(REQUEST_SELECT)
    .eq("retailer_id", retailerId)
    .order("created_at", { ascending: false })
    .limit(100);
  let cashQ = supabase
    .from("cash_submissions")
    .select(CASH_SELECT)
    .eq("retailer_id", retailerId)
    .order("created_at", { ascending: false })
    .limit(100);
  let eodQ = supabase
    .from("eod_transactions")
    .select("*")
    .eq("retailer_id", retailerId)
    .order("txn_date", { ascending: false })
    .limit(100);

  if (accountId) {
    reqQ = reqQ.eq("account_id", accountId);
    cashQ = cashQ.eq("account_id", accountId);
    eodQ = eodQ.eq("account_id", accountId);
  }

  const [requests, cash, eod] = await Promise.all([reqQ, cashQ, eodQ]);
  if (requests.error) throw requests.error;
  if (cash.error) throw cash.error;
  if (eod.error) throw eod.error;
  return {
    requests: (requests.data ?? []) as unknown as RequestRow[],
    cash: (cash.data ?? []) as unknown as CashRow[],
    eod: (eod.data ?? []) as EodRow[],
  };
}

export async function getRetailerSummaries(
  distributorId: string,
  accountId: string,
): Promise<RetailerSummary[]> {
  const supabase = await createClient();

  const { data: retailers, error: rErr } = await supabase
    .from("profiles")
    .select(`id, retailer_code, full_name, active, needs_assignment, fos_id,
             fos:fos_id(full_name)`)
    .eq("role", "retailer")
    .eq("distributor_id", distributorId)
    .order("retailer_code", { ascending: true });
  if (rErr) throw rErr;
  if (!retailers || retailers.length === 0) return [];

  const ids = retailers.map((r) => r.id);

  const [reqRes, eodRes, balanceRes] = await Promise.all([
    supabase
      .from("money_requests")
      .select("retailer_id, requested_amount, fos_amount, final_amount")
      .in("retailer_id", ids)
      .eq("account_id", accountId)
      .eq("distributor_status", "approved"),
    supabase
      .from("eod_transactions")
      .select("retailer_id, type, amount")
      .in("retailer_id", ids)
      .eq("account_id", accountId)
      .eq("type", "reversal"),
    supabase
      .from("daily_balances")
      .select("retailer_id, balance_date, closing, transferred, reversed, cash_received")
      .in("retailer_id", ids)
      .eq("account_id", accountId)
      .order("balance_date", { ascending: false }),
  ]);
  if (reqRes.error) throw reqRes.error;
  if (eodRes.error) throw eodRes.error;
  if (balanceRes.error) throw balanceRes.error;

  const transferred = new Map<string, number>();
  for (const r of reqRes.data ?? []) {
    const amt = Number(r.final_amount ?? r.fos_amount ?? r.requested_amount);
    transferred.set(r.retailer_id, (transferred.get(r.retailer_id) ?? 0) + amt);
  }
  const reversed = new Map<string, number>();
  for (const r of eodRes.data ?? []) {
    reversed.set(r.retailer_id, (reversed.get(r.retailer_id) ?? 0) + Number(r.amount));
  }
  const latestClosing = new Map<string, number>();
  const cashTotal = new Map<string, number>();
  for (const b of balanceRes.data ?? []) {
    if (!latestClosing.has(b.retailer_id)) latestClosing.set(b.retailer_id, Number(b.closing));
    cashTotal.set(b.retailer_id, (cashTotal.get(b.retailer_id) ?? 0) + Number(b.cash_received));
  }

  return retailers.map((r) => {
    const t = transferred.get(r.id) ?? 0;
    const v = reversed.get(r.id) ?? 0;
    const c = cashTotal.get(r.id) ?? 0;
    const closing = latestClosing.get(r.id) ?? t - v - c;
    return {
      id: r.id,
      retailer_code: r.retailer_code,
      full_name: r.full_name,
      active: r.active,
      needs_assignment: r.needs_assignment,
      fos_id: r.fos_id,
      fos_name:
        ((r as unknown as { fos: { full_name: string } | null }).fos)?.full_name ?? null,
      total_transferred: t,
      total_reversed: v,
      total_cash: c,
      outstanding: closing,
    };
  });
}

export async function getRetailerDailyBalances(
  retailerId: string,
  accountId: string,
  limit = 90,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_balances")
    .select("*")
    .eq("retailer_id", retailerId)
    .eq("account_id", accountId)
    .order("balance_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getRetailerLatestClosingPerAccount(retailerId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_balances")
    .select("account_id, balance_date, closing")
    .eq("retailer_id", retailerId)
    .order("balance_date", { ascending: false });
  if (error) throw error;
  const map = new Map<string, number>();
  for (const b of data ?? []) {
    if (!map.has(b.account_id)) map.set(b.account_id, Number(b.closing));
  }
  return map;
}

export async function getDistributorRoster(distributorId: string) {
  const supabase = await createClient();
  const [fos, retailers] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, phone, active, fos_auto_approve, created_at")
      .eq("role", "fos")
      .eq("distributor_id", distributorId)
      .order("full_name"),
    supabase
      .from("profiles")
      .select("id, retailer_code, full_name, phone, active, needs_assignment, fos_id, created_at")
      .eq("role", "retailer")
      .eq("distributor_id", distributorId)
      .order("retailer_code"),
  ]);
  if (fos.error) throw fos.error;
  if (retailers.error) throw retailers.error;
  return { fos: fos.data ?? [], retailers: retailers.data ?? [] };
}

export type CashReportSummary = {
  retailer_id: string;
  retailer_code: string | null;
  full_name: string;
  account_id: string;
  txn_date: string;
  book_amount: number;
  system_amount: number;
  diff: number;
};

export type EodTxnRow = {
  id: string;
  type: "transfer" | "reversal";
  amount: string;
  txn_date: string;
  bank_reference: string | null;
  notes: string | null;
  created_at: string;
  retailer: { full_name: string; retailer_code: string | null } | null;
};

export async function getEodTransactions(
  distributorId: string,
  accountId: string,
  limit = 500,
): Promise<EodTxnRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("eod_transactions")
    .select(
      "id, type, amount, txn_date, bank_reference, notes, created_at, retailer:retailer_id(full_name, retailer_code)",
    )
    .eq("distributor_id", distributorId)
    .eq("account_id", accountId)
    .order("txn_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as EodTxnRow[];
}

export type EodReconRow = {
  date: string;
  retailer_id: string;
  code: string;
  name: string;
  file: number;
  app: number;
};

/* File-vs-app comparison: EOD transfer rows from uploaded files vs requests
   approved in the app, grouped per retailer per IST day. */
export async function getEodReconciliation(
  distributorId: string,
  accountId: string,
): Promise<EodReconRow[]> {
  const supabase = await createClient();
  const [txns, reqs, profiles] = await Promise.all([
    supabase
      .from("eod_transactions")
      .select("retailer_id, amount, txn_date")
      .eq("distributor_id", distributorId)
      .eq("account_id", accountId)
      .eq("type", "transfer"),
    supabase
      .from("money_requests")
      .select("retailer_id, requested_amount, fos_amount, final_amount, distributor_acted_at")
      .eq("distributor_id", distributorId)
      .eq("account_id", accountId)
      .eq("distributor_status", "approved"),
    supabase
      .from("profiles")
      .select("id, full_name, retailer_code")
      .eq("distributor_id", distributorId)
      .eq("role", "retailer"),
  ]);
  const byId = new Map((profiles.data ?? []).map((p) => [p.id, p]));
  const ist = (iso: string) =>
    new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

  const map = new Map<string, EodReconRow>();
  const get = (rid: string, date: string) => {
    const k = `${rid}|${date}`;
    let row = map.get(k);
    if (!row) {
      const prof = byId.get(rid);
      row = {
        date,
        retailer_id: rid,
        code: prof?.retailer_code ?? "",
        name: prof?.full_name ?? "?",
        file: 0,
        app: 0,
      };
      map.set(k, row);
    }
    return row;
  };
  for (const x of txns.data ?? []) get(x.retailer_id, x.txn_date).file += Number(x.amount);
  for (const r of reqs.data ?? []) {
    if (!r.distributor_acted_at) continue;
    get(r.retailer_id, ist(r.distributor_acted_at)).app += Number(
      r.final_amount ?? r.fos_amount ?? r.requested_amount,
    );
  }
  return [...map.values()].sort(
    (a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name),
  );
}

export async function getCashReportReconciliation(
  distributorId: string,
  accountId: string,
  date?: string,
): Promise<CashReportSummary[]> {
  const supabase = await createClient();

  // All book entries on this account, optionally limited to a date.
  let bookQ = supabase
    .from("cash_report_entries")
    .select("retailer_id, account_id, txn_date, amount")
    .eq("account_id", accountId);
  if (date) bookQ = bookQ.eq("txn_date", date);
  const { data: book, error: bookErr } = await bookQ;
  if (bookErr) throw bookErr;

  // Approved cash on the same scope (compared even though book wins).
  let cashQ = supabase
    .from("cash_submissions")
    .select("retailer_id, account_id, txn_date, amount, approved_amount, status")
    .eq("account_id", accountId)
    .eq("distributor_id", distributorId)
    .eq("status", "approved");
  if (date) cashQ = cashQ.eq("txn_date", date);
  const { data: cash, error: cashErr } = await cashQ;
  if (cashErr) throw cashErr;

  // Aggregate by (retailer, date)
  type Key = string;
  const k = (rid: string, d: string): Key => `${rid}|${d}`;
  const bookMap = new Map<Key, number>();
  for (const e of book ?? []) {
    bookMap.set(k(e.retailer_id, e.txn_date),
      (bookMap.get(k(e.retailer_id, e.txn_date)) ?? 0) + Number(e.amount));
  }
  const cashMap = new Map<Key, number>();
  for (const c of cash ?? []) {
    cashMap.set(k(c.retailer_id, c.txn_date),
      (cashMap.get(k(c.retailer_id, c.txn_date)) ?? 0)
        + Number(c.approved_amount ?? c.amount));
  }

  const allKeys = new Set<Key>([...bookMap.keys(), ...cashMap.keys()]);
  const retailerIds = Array.from(new Set(
    Array.from(allKeys).map((key) => key.split("|")[0]),
  ));
  if (retailerIds.length === 0) return [];

  const { data: retailers } = await supabase
    .from("profiles")
    .select("id, retailer_code, full_name")
    .in("id", retailerIds);
  const retailerMap = new Map<string, { code: string | null; name: string }>();
  for (const r of retailers ?? []) {
    retailerMap.set(r.id, { code: r.retailer_code, name: r.full_name });
  }

  const out: CashReportSummary[] = [];
  for (const key of allKeys) {
    const [rid, txn_date] = key.split("|");
    const book_amount = bookMap.get(key) ?? 0;
    const system_amount = cashMap.get(key) ?? 0;
    const r = retailerMap.get(rid);
    out.push({
      retailer_id: rid,
      retailer_code: r?.code ?? null,
      full_name: r?.name ?? "?",
      account_id: accountId,
      txn_date,
      book_amount,
      system_amount,
      diff: book_amount - system_amount,
    });
  }
  // Sort by date desc, then by retailer_code
  out.sort((a, b) => {
    if (a.txn_date !== b.txn_date) return a.txn_date > b.txn_date ? -1 : 1;
    return (a.retailer_code ?? "").localeCompare(b.retailer_code ?? "");
  });
  return out;
}
