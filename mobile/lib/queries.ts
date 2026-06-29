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
  opening?: number;
  total_transferred: number;
  total_reversed: number;
  total_cash: number;
  outstanding: number;
  defaulted?: boolean;
  atRisk?: boolean;
  personal?: boolean;
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

export type DateRange = { from: string; to: string };

export async function getRetailerHistory(
  retailerId: string,
  accountId?: string,
  // When given, the statement is limited to this date window (the default,
  // light view). When omitted, the full history is returned ("All").
  range?: DateRange,
) {
  const cap = range ? 1000 : 100;
  let reqQ = supabase
    .from("money_requests")
    .select("*")
    .eq("retailer_id", retailerId)
    .order("created_at", { ascending: false })
    .limit(cap);
  let cashQ = supabase
    .from("cash_submissions")
    .select("*")
    .eq("retailer_id", retailerId)
    .order("created_at", { ascending: false })
    .limit(cap);
  let eodQ = supabase
    .from("eod_transactions")
    .select("*")
    .eq("retailer_id", retailerId)
    .order("txn_date", { ascending: false })
    .limit(cap);
  if (accountId) {
    reqQ = reqQ.eq("account_id", accountId);
    cashQ = cashQ.eq("account_id", accountId);
    eodQ = eodQ.eq("account_id", accountId);
  }
  if (range) {
    // money_requests has no txn_date — filter on created_at (UTC, matching the app).
    reqQ = reqQ
      .gte("created_at", `${range.from}T00:00:00.000Z`)
      .lte("created_at", `${range.to}T23:59:59.999Z`);
    cashQ = cashQ.gte("txn_date", range.from).lte("txn_date", range.to);
    eodQ = eodQ.gte("txn_date", range.from).lte("txn_date", range.to);
  }
  const [requests, cash, eod] = await Promise.all([reqQ, cashQ, eodQ]);
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
    .eq("excluded", false)
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

/* Outstanding screen, windowed: per-retailer MOVEMENTS (transferred/reversed/
   cash) summed over [range.from, range.to] from the ledger, while `outstanding`
   is the carried balance — the closing of the latest day on/before range.to. */
export async function getDistributorRetailerSummariesByDate(
  distributorId: string,
  accountId: string,
  range: DateRange,
  // When set, restrict to retailers assigned to this FOS (FOS-facing report).
  fosId?: string,
  // When set, restrict to a single retailer (retailer-facing own view).
  retailerId?: string,
): Promise<RetailerSummary[]> {
  let rQ = supabase
    .from("profiles")
    .select("id, retailer_code, full_name, active, needs_assignment, fos_id, defaulted, personal, fos:fos_id(full_name)")
    .eq("role", "retailer")
    .eq("distributor_id", distributorId)
    .eq("excluded", false)
    .order("retailer_code");
  if (fosId) rQ = rQ.eq("fos_id", fosId);
  if (retailerId) rQ = rQ.eq("id", retailerId);
  const { data: retailers, error } = await rQ;
  if (error) throw error;
  if (!retailers || retailers.length === 0) return [];

  const ids = retailers.map((r) => r.id);
  const [balsRes, cashRes] = await Promise.all([
    supabase
      .from("daily_balances")
      .select("retailer_id, balance_date, transferred, reversed, cash_received, closing")
      .in("retailer_id", ids)
      .eq("account_id", accountId)
      .lte("balance_date", range.to)
      .order("balance_date", { ascending: false }),
    // Last cash across ALL accounts (cash book / EOD), newest first — drives the
    // 45-day at-risk signal. Cash lives here, not in cash_submissions.
    supabase
      .from("daily_balances")
      .select("retailer_id, balance_date")
      .in("retailer_id", ids)
      .gt("cash_received", 0)
      .order("balance_date", { ascending: false }),
  ]);
  const bals = balsRes.data;
  if (balsRes.error) throw balsRes.error;
  if (cashRes.error) throw cashRes.error;

  const lastPayment = new Map<string, string>();
  for (const c of cashRes.data ?? []) {
    if (!lastPayment.has(c.retailer_id)) lastPayment.set(c.retailer_id, c.balance_date);
  }
  const riskCutoff = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 45);
    return d.toISOString().slice(0, 10);
  })();

  const transferred = new Map<string, number>();
  const reversed = new Map<string, number>();
  const cash = new Map<string, number>();
  const closing = new Map<string, number>();
  const opening = new Map<string, number>(); // carried balance at window start
  for (const b of bals ?? []) {
    if (!closing.has(b.retailer_id)) closing.set(b.retailer_id, Number(b.closing));
    if (b.balance_date >= range.from) {
      transferred.set(b.retailer_id, (transferred.get(b.retailer_id) ?? 0) + Number(b.transferred));
      reversed.set(b.retailer_id, (reversed.get(b.retailer_id) ?? 0) + Number(b.reversed));
      cash.set(b.retailer_id, (cash.get(b.retailer_id) ?? 0) + Number(b.cash_received));
    } else if (!opening.has(b.retailer_id)) {
      // First row before the window = carried-in opening for the window.
      opening.set(b.retailer_id, Number(b.closing));
    }
  }

  return retailers.map((r) => {
    const out = closing.get(r.id) ?? 0;
    const lp = lastPayment.get(r.id);
    const defaulted = (r as unknown as { defaulted: boolean | null }).defaulted ?? false;
    const personal = (r as unknown as { personal: boolean | null }).personal ?? false;
    return {
      id: r.id,
      retailer_code: r.retailer_code,
      full_name: r.full_name,
      active: r.active,
      needs_assignment: r.needs_assignment,
      fos_id: r.fos_id,
      fos_name: ((r as unknown as { fos: { full_name: string } | null }).fos)?.full_name ?? null,
      opening: opening.get(r.id) ?? 0,
      total_transferred: transferred.get(r.id) ?? 0,
      total_reversed: reversed.get(r.id) ?? 0,
      total_cash: cash.get(r.id) ?? 0,
      outstanding: out,
      defaulted,
      personal,
      atRisk: !defaulted && !personal && out > 0 && (!lp || lp < riskCutoff),
    };
  });
}

export type ActionBucket = "attention" | "alert" | "atrisk" | "defaulter";
export type ActionRow = {
  bucket: ActionBucket;
  retailer_id: string;
  full_name: string;
  retailer_code: string | null;
  phone: string | null;
  fos_id: string | null;
  outstanding: number; // pending till 3 PM
  full_pending: number; // total current outstanding
  today_transfer: number;
  transfer_at: string | null;
  last_cash: string | null;
  ref_day: string;
};

export async function getActionCenter(
  distributorId: string,
  fosId?: string,
): Promise<ActionRow[]> {
  const { data, error } = await supabase.rpc("action_center", {
    p_distributor: distributorId,
    p_fos: fosId ?? null,
  });
  if (error) throw error;
  return ((data ?? []) as ActionRow[]).map((r) => ({
    ...r,
    outstanding: Number(r.outstanding),
    full_pending: Number(r.full_pending),
    today_transfer: Number(r.today_transfer),
  }));
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
