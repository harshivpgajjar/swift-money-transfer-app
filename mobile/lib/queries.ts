import { supabase } from "./supabase";
import type { ApprovalStatus, EodTxnType, RequestFosStatus } from "./types";

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
  submitter: { full_name: string; role: string } | null;
  account: { name: string; slug: string } | null;
};

export type EodRow = {
  id: string;
  retailer_id: string;
  type: EodTxnType;
  amount: string;
  txn_date: string;
  bank_reference: string | null;
  notes: string | null;
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
  fos_status, fos_acted_at, fos_notes, distributor_status,
  distributor_acted_at, distributor_notes, created_at,
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

export async function getFosInbox(fosId: string, statuses: RequestFosStatus[]) {
  const { data, error } = await supabase
    .from("money_requests")
    .select(REQUEST_SELECT)
    .eq("fos_id", fosId)
    .in("fos_status", statuses)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as RequestRow[];
}

export async function getDistributorPendingRequests(distributorId: string) {
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

/* Requests the FOS hasn't decided yet — the distributor can act directly. */
export async function getDistributorFosPendingRequests(distributorId: string) {
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
  const { data, error } = await supabase
    .from("cash_submissions")
    .select(CASH_SELECT)
    .eq("distributor_id", distributorId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as CashRow[];
}

export async function getRetailerLatestBalance(retailerId: string) {
  const { data, error } = await supabase
    .from("daily_balances")
    .select("opening, transferred, reversed, cash_received, closing, balance_date")
    .eq("retailer_id", retailerId)
    .order("balance_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getRetailerHistory(retailerId: string, accountId?: string) {
  const reqQ = supabase
    .from("money_requests")
    .select("*")
    .eq("retailer_id", retailerId)
    .order("created_at", { ascending: false })
    .limit(50);
  const cashQ = supabase
    .from("cash_submissions")
    .select("*")
    .eq("retailer_id", retailerId)
    .order("created_at", { ascending: false })
    .limit(50);
  const eodQ = supabase
    .from("eod_transactions")
    .select("*")
    .eq("retailer_id", retailerId)
    .order("txn_date", { ascending: false })
    .limit(50);
  const [requests, cash, eod] = await Promise.all([
    accountId ? reqQ.eq("account_id", accountId) : reqQ,
    accountId ? cashQ.eq("account_id", accountId) : cashQ,
    accountId ? eodQ.eq("account_id", accountId) : eodQ,
  ]);
  if (requests.error) throw requests.error;
  if (cash.error) throw cash.error;
  if (eod.error) throw eod.error;
  return {
    requests: (requests.data ?? []) as RequestRow[],
    cash: (cash.data ?? []) as CashRow[],
    eod: (eod.data ?? []) as EodRow[],
  };
}

export async function getFosRetailers(fosId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, retailer_code, full_name, phone, active")
    .eq("fos_id", fosId)
    .eq("role", "retailer")
    .order("retailer_code");
  if (error) throw error;

  const ids = (data ?? []).map((r) => r.id);
  if (!ids.length) {
    return (data ?? []).map((r) => ({ ...r, outstanding: 0 }));
  }

  const { data: balances } = await supabase
    .from("daily_balances")
    .select("retailer_id, balance_date, closing")
    .in("retailer_id", ids)
    .order("balance_date", { ascending: false });

  const latest = new Map<string, number>();
  for (const b of balances ?? []) {
    if (!latest.has(b.retailer_id)) latest.set(b.retailer_id, Number(b.closing));
  }

  return (data ?? []).map((r) => ({ ...r, outstanding: latest.get(r.id) ?? 0 }));
}

export async function getDistributorRetailerSummaries(
  distributorId: string,
  accountId?: string,
): Promise<RetailerSummary[]> {
  const { data: retailers, error } = await supabase
    .from("profiles")
    .select("id, retailer_code, full_name, active, needs_assignment, fos_id, fos:fos_id(full_name)")
    .eq("role", "retailer")
    .eq("distributor_id", distributorId)
    .order("retailer_code");
  if (error) throw error;
  if (!retailers || retailers.length === 0) return [];

  const ids = retailers.map((r) => r.id);
  let reqQ = supabase
    .from("money_requests")
    .select("retailer_id, requested_amount, fos_amount, final_amount")
    .in("retailer_id", ids)
    .eq("distributor_status", "approved");
  let eodQ = supabase
    .from("eod_transactions")
    .select("retailer_id, type, amount")
    .in("retailer_id", ids)
    .eq("type", "reversal");
  let cashQ = supabase
    .from("cash_submissions")
    .select("retailer_id, amount, approved_amount, status")
    .in("retailer_id", ids)
    .eq("status", "approved");
  let balQ = supabase
    .from("daily_balances")
    .select("retailer_id, balance_date, closing")
    .in("retailer_id", ids)
    .order("balance_date", { ascending: false });
  if (accountId) {
    reqQ = reqQ.eq("account_id", accountId);
    eodQ = eodQ.eq("account_id", accountId);
    cashQ = cashQ.eq("account_id", accountId);
    balQ = balQ.eq("account_id", accountId);
  }
  const [reqRes, eodRes, cashRes, balanceRes] = await Promise.all([reqQ, eodQ, cashQ, balQ]);
  if (reqRes.error) throw reqRes.error;
  if (eodRes.error) throw eodRes.error;
  if (cashRes.error) throw cashRes.error;
  if (balanceRes.error) throw balanceRes.error;

  // Approval is the financial event — count approved request amounts as "transferred",
  // honoring final_amount if the distributor edited it on approve.
  const transferred = new Map<string, number>();
  for (const r of reqRes.data ?? []) {
    const amt = Number(r.final_amount ?? r.fos_amount ?? r.requested_amount);
    transferred.set(r.retailer_id, (transferred.get(r.retailer_id) ?? 0) + amt);
  }
  const reversed = new Map<string, number>();
  for (const r of eodRes.data ?? []) {
    reversed.set(r.retailer_id, (reversed.get(r.retailer_id) ?? 0) + Number(r.amount));
  }
  const cashTotal = new Map<string, number>();
  for (const c of cashRes.data ?? []) {
    const amt = Number(c.approved_amount ?? c.amount);
    cashTotal.set(c.retailer_id, (cashTotal.get(c.retailer_id) ?? 0) + amt);
  }
  const latestClosing = new Map<string, number>();
  for (const b of balanceRes.data ?? []) {
    if (!latestClosing.has(b.retailer_id)) latestClosing.set(b.retailer_id, Number(b.closing));
  }

  return retailers.map((r) => {
    const t = transferred.get(r.id) ?? 0;
    const v = reversed.get(r.id) ?? 0;
    const c = cashTotal.get(r.id) ?? 0;
    return {
      id: r.id,
      retailer_code: r.retailer_code,
      full_name: r.full_name,
      active: r.active,
      needs_assignment: r.needs_assignment,
      fos_id: r.fos_id,
      fos_name: ((r as unknown as { fos: { full_name: string } | null }).fos)?.full_name ?? null,
      total_transferred: t,
      total_reversed: v,
      total_cash: c,
      outstanding: latestClosing.get(r.id) ?? t - v - c,
    };
  });
}

export async function getDistributorRoster(distributorId: string) {
  const [fos, retailers] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, phone, active")
      .eq("role", "fos")
      .eq("distributor_id", distributorId)
      .order("full_name"),
    supabase
      .from("profiles")
      .select("id, retailer_code, full_name, phone, active, needs_assignment, fos_id")
      .eq("role", "retailer")
      .eq("distributor_id", distributorId)
      .order("retailer_code"),
  ]);
  if (fos.error) throw fos.error;
  if (retailers.error) throw retailers.error;
  return { fos: fos.data ?? [], retailers: retailers.data ?? [] };
}
