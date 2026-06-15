import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/* Distributor dashboard analytics — one server-side computation consumed by
   the web dashboard and (via /api/analytics/distributor) the mobile app.
   All "today" math uses IST (Asia/Kolkata). */

export type AgingBucket = { label: "0-7" | "8-15" | "16-30" | "30+"; amount: number };

export type AnalyticsData = {
  asOf: string;
  pulse: {
    today: { disbursed: number; collected: number; net: number };
    yesterday: { disbursed: number; collected: number; net: number };
  };
  outstanding: {
    total: number;
    byAccount: { id: string; name: string; amount: number }[];
    series: { date: string; total: number }[]; // last 30 days, carry-forward
  };
  aging: {
    buckets: AgingBucket[];
    topOverdue: { name: string; code: string; amount: number; days: number }[];
  };
  slowPayers: { name: string; code: string; outstanding: number; avgDays: number | null; oldestDays: number }[];
  fos: {
    name: string;
    outstanding: number;
    collected7d: number;
    pendingRequests: number;
    pendingCash: number;
    avgResponseHours: number | null;
  }[];
  recon: { matched: boolean; diffAmount: number; diffPairs: number; unmatchedEod: number };
  // Retailers who received portal transfers with no matching app request —
  // the "not using the app" list (last 30 days).
  appUsage: { name: string; code: string; transfers: number; amount: number }[];
  discrepancies: {
    requests: {
      retailer: string;
      code: string;
      date: string;
      requested: number;
      fosAmount: number | null;
      final: number;
    }[];
    cash: {
      retailer: string;
      code: string;
      date: string;
      claimed: number;
      received: number;
      declined: boolean;
    }[];
  };
  alerts: {
    staleRequests: { retailer: string; fos: string; amount: number; hours: number }[];
    staleCash: { retailer: string; amount: number; hours: number }[];
    noPayment14d: { name: string; code: string; outstanding: number }[];
    neverLoggedIn: number;
  };
};

function istDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
}

export async function getDistributorAnalytics(distributorId: string): Promise<AnalyticsData> {
  const admin = createAdminClient();
  const now = new Date();
  const today = istDate(now);
  const yesterday = istDate(new Date(now.getTime() - 86400e3));
  const d30 = istDate(new Date(now.getTime() - 30 * 86400e3));

  const [accountsRes, profilesRes, requestsRes, cashRes, balancesRes, eodRes, bookRes] =
    await Promise.all([
      admin
        .from("accounts")
        .select("id, name, slug")
        .eq("distributor_id", distributorId)
        .eq("active", true)
        .order("display_order"),
      admin
        .from("profiles")
        .select("id, full_name, retailer_code, role, fos_id, active, must_change_password")
        .eq("distributor_id", distributorId),
      admin
        .from("money_requests")
        .select(
          "retailer_id, fos_id, account_id, requested_amount, fos_amount, final_amount, fos_status, distributor_status, created_at, fos_acted_at, distributor_acted_at",
        )
        .eq("distributor_id", distributorId),
      admin
        .from("cash_submissions")
        .select("retailer_id, account_id, amount, approved_amount, status, txn_date, created_at, approved_at, submitted_by")
        .eq("distributor_id", distributorId),
      admin
        .from("daily_balances")
        .select("retailer_id, account_id, balance_date, closing, transferred, reversed, cash_received")
        .order("balance_date", { ascending: true }),
      admin
        .from("eod_transactions")
        .select("retailer_id, account_id, type, amount, txn_date")
        .eq("distributor_id", distributorId),
      admin
        .from("cash_report_entries")
        .select("retailer_id, account_id, txn_date, amount"),
    ]);

  const accounts = accountsRes.data ?? [];
  const accountIds = new Set(accounts.map((a) => a.id));
  const profiles = profilesRes.data ?? [];
  const retailers = profiles.filter((p) => p.role === "retailer");
  const fosList = profiles.filter((p) => p.role === "fos");
  const retailerById = new Map(retailers.map((r) => [r.id, r]));
  const fosById = new Map(fosList.map((f) => [f.id, f]));
  const requests = requestsRes.data ?? [];
  const cash = cashRes.data ?? [];
  const balances = (balancesRes.data ?? []).filter((b) => accountIds.has(b.account_id));
  const eod = eodRes.data ?? [];
  const book = (bookRes.data ?? []).filter((b) => accountIds.has(b.account_id));

  const reqAmount = (r: (typeof requests)[number]) =>
    Number(r.final_amount ?? r.fos_amount ?? r.requested_amount);
  const cashAmount = (c: (typeof cash)[number]) => Number(c.approved_amount ?? c.amount);

  /* ---- pulse: today / yesterday (IST) ----
     Read from daily_balances — the one place the full model (EOD-file credit,
     book-cash precedence, manual adjustments) is already resolved. Disbursed =
     credit given; collected = cash + reversals that came back. */
  const pulseFor = (day: string) => {
    let disbursed = 0;
    let collected = 0;
    for (const b of balances) {
      if (b.balance_date !== day || !retailerById.has(b.retailer_id)) continue;
      disbursed += Number(b.transferred);
      collected += Number(b.reversed) + Number(b.cash_received);
    }
    return { disbursed, collected, net: disbursed - collected };
  };

  /* ---- outstanding: latest closings + per-account + 30d series ---- */
  const latest = new Map<string, number>(); // retailer|account → closing
  const byAccount = new Map<string, number>();
  const perRetailer = new Map<string, number>();
  for (const b of balances) {
    latest.set(`${b.retailer_id}|${b.account_id}`, Number(b.closing)); // asc order → last wins
  }
  for (const [key, v] of latest) {
    const [rid, aid] = key.split("|");
    if (!retailerById.has(rid)) continue;
    byAccount.set(aid, (byAccount.get(aid) ?? 0) + v);
    perRetailer.set(rid, (perRetailer.get(rid) ?? 0) + v);
  }
  const totalOutstanding = [...byAccount.values()].reduce((s, v) => s + v, 0);

  // carry-forward series
  const series: { date: string; total: number }[] = [];
  const carry = new Map<string, number>();
  const byDay = new Map<string, { key: string; closing: number }[]>();
  for (const b of balances) {
    if (!retailerById.has(b.retailer_id)) continue;
    const list = byDay.get(b.balance_date) ?? [];
    list.push({ key: `${b.retailer_id}|${b.account_id}`, closing: Number(b.closing) });
    byDay.set(b.balance_date, list);
  }
  const allDays = [...byDay.keys()].sort();
  let di = 0;
  for (let i = 30; i >= 0; i--) {
    const day = istDate(new Date(now.getTime() - i * 86400e3));
    while (di < allDays.length && allDays[di] <= day) {
      for (const e of byDay.get(allDays[di]) ?? []) carry.set(e.key, e.closing);
      di++;
    }
    series.push({ date: day, total: [...carry.values()].reduce((s, v) => s + v, 0) });
  }

  /* ---- aging + days-to-clear (FIFO per retailer+account) ---- */
  const buckets: Record<string, number> = { "0-7": 0, "8-15": 0, "16-30": 0, "30+": 0 };
  const oldestDays = new Map<string, number>(); // retailer → oldest unpaid credit age
  const clearDays = new Map<string, number[]>(); // retailer → days-to-clear samples

  const creditsByPair = new Map<string, { date: string; amt: number }[]>();
  for (const r of requests) {
    if (r.distributor_status !== "approved" || !r.distributor_acted_at) continue;
    const key = `${r.retailer_id}|${r.account_id}`;
    const list = creditsByPair.get(key) ?? [];
    list.push({ date: istDate(new Date(r.distributor_acted_at)), amt: reqAmount(r) });
    creditsByPair.set(key, list);
  }
  const paymentsByPair = new Map<string, { date: string; amt: number }[]>();
  for (const c of cash) {
    if (c.status !== "approved") continue;
    const key = `${c.retailer_id}|${c.account_id}`;
    const list = paymentsByPair.get(key) ?? [];
    list.push({ date: c.txn_date, amt: cashAmount(c) });
    paymentsByPair.set(key, list);
  }
  for (const e of eod) {
    if (e.type !== "reversal") continue;
    const key = `${e.retailer_id}|${e.account_id}`;
    const list = paymentsByPair.get(key) ?? [];
    list.push({ date: e.txn_date, amt: Number(e.amount) });
    paymentsByPair.set(key, list);
  }

  const todayMs = new Date(today + "T00:00:00").getTime();
  const ageDays = (d: string) =>
    Math.max(0, Math.round((todayMs - new Date(d + "T00:00:00").getTime()) / 86400e3));

  for (const [key, credits] of creditsByPair) {
    const rid = key.split("|")[0];
    if (!retailerById.has(rid)) continue;
    credits.sort((a, b) => a.date.localeCompare(b.date));
    const payments = (paymentsByPair.get(key) ?? []).sort((a, b) => a.date.localeCompare(b.date));
    let pi = 0;
    let payLeft = payments[0]?.amt ?? 0;
    for (const credit of credits) {
      let need = credit.amt;
      while (need > 0.005 && pi < payments.length) {
        const used = Math.min(need, payLeft);
        need -= used;
        payLeft -= used;
        if (payLeft <= 0.005) {
          pi++;
          payLeft = payments[pi]?.amt ?? 0;
        }
      }
      if (need <= 0.005) {
        // fully cleared at the date of the covering payment
        const coverDate = payments[Math.min(pi, payments.length - 1)]?.date;
        if (coverDate && coverDate >= credit.date) {
          const list = clearDays.get(rid) ?? [];
          list.push(ageDays(credit.date) - ageDays(coverDate));
          clearDays.set(rid, list);
        }
      } else {
        const age = ageDays(credit.date);
        const bucket = age <= 7 ? "0-7" : age <= 15 ? "8-15" : age <= 30 ? "16-30" : "30+";
        buckets[bucket] += need;
        oldestDays.set(rid, Math.max(oldestDays.get(rid) ?? 0, age));
      }
    }
  }

  const topOverdue = [...oldestDays.entries()]
    .map(([rid, days]) => ({
      name: retailerById.get(rid)?.full_name ?? "?",
      code: retailerById.get(rid)?.retailer_code ?? "",
      amount: perRetailer.get(rid) ?? 0,
      days,
    }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.days - a.days || b.amount - a.amount)
    .slice(0, 5);

  const slowPayers = [...oldestDays.entries()]
    .map(([rid, days]) => {
      const samples = clearDays.get(rid) ?? [];
      return {
        name: retailerById.get(rid)?.full_name ?? "?",
        code: retailerById.get(rid)?.retailer_code ?? "",
        outstanding: perRetailer.get(rid) ?? 0,
        avgDays: samples.length
          ? Math.round(samples.reduce((s, v) => s + v, 0) / samples.length)
          : null,
        oldestDays: days,
      };
    })
    .filter((x) => x.outstanding > 0)
    .sort((a, b) => b.oldestDays - a.oldestDays || b.outstanding - a.outstanding)
    .slice(0, 5);

  /* ---- FOS scorecards ---- */
  const weekAgo = istDate(new Date(now.getTime() - 7 * 86400e3));
  const fosCards = fosList
    .filter((f) => f.active)
    .map((f) => {
      const myRetailers = new Set(retailers.filter((r) => r.fos_id === f.id).map((r) => r.id));
      const outstanding = [...myRetailers].reduce((s, rid) => s + (perRetailer.get(rid) ?? 0), 0);
      const collected7d = cash
        .filter(
          (c) =>
            c.status === "approved" &&
            myRetailers.has(c.retailer_id) &&
            c.approved_at &&
            istDate(new Date(c.approved_at)) >= weekAgo,
        )
        .reduce((s, c) => s + cashAmount(c), 0);
      const pendingRequests = requests.filter(
        (r) => r.fos_id === f.id && r.fos_status === "pending",
      ).length;
      const pendingCash = cash.filter(
        (c) => c.status === "pending" && myRetailers.has(c.retailer_id),
      ).length;
      const responded = requests.filter(
        (r) => r.fos_id === f.id && r.fos_acted_at && istDate(new Date(r.created_at)) >= d30,
      );
      const avgResponseHours = responded.length
        ? Math.round(
            (responded.reduce(
              (s, r) =>
                s + (new Date(r.fos_acted_at!).getTime() - new Date(r.created_at).getTime()),
              0,
            ) /
              responded.length /
              3600e3) *
              10,
          ) / 10
        : null;
      return {
        name: f.full_name,
        outstanding,
        collected7d,
        pendingRequests,
        pendingCash,
        avgResponseHours,
      };
    })
    .sort((a, b) => b.outstanding - a.outstanding);

  /* ---- reconciliation health ---- */
  const bookMap = new Map<string, number>();
  for (const b of book) {
    const k = `${b.retailer_id}|${b.account_id}|${b.txn_date}`;
    bookMap.set(k, (bookMap.get(k) ?? 0) + Number(b.amount));
  }
  const coveredKeys = new Set([...bookMap.keys()].map((k) => k.split("|").slice(1).join("|")));
  const sysMap = new Map<string, number>();
  for (const c of cash) {
    if (c.status !== "approved") continue;
    const cover = `${c.account_id}|${c.txn_date}`;
    if (!coveredKeys.has(cover)) continue; // only compare dates the book covers
    const k = `${c.retailer_id}|${c.account_id}|${c.txn_date}`;
    sysMap.set(k, (sysMap.get(k) ?? 0) + cashAmount(c));
  }
  let diffAmount = 0;
  let diffPairs = 0;
  for (const k of new Set([...bookMap.keys(), ...sysMap.keys()])) {
    const d = (bookMap.get(k) ?? 0) - (sysMap.get(k) ?? 0);
    if (Math.abs(d) > 0.01) {
      diffPairs++;
      diffAmount += Math.abs(d);
    }
  }

  // unmatched EOD transfers (same heuristic as import: retailer+amount within 7d)
  const approvedByRetailer = new Map<string, { amt: number; date: string }[]>();
  for (const r of requests) {
    if (r.distributor_status !== "approved" || !r.distributor_acted_at) continue;
    const list = approvedByRetailer.get(r.retailer_id) ?? [];
    list.push({ amt: reqAmount(r), date: istDate(new Date(r.distributor_acted_at)) });
    approvedByRetailer.set(r.retailer_id, list);
  }
  let unmatchedEod = 0;
  const offApp = new Map<string, { transfers: number; amount: number }>();
  for (const e of eod) {
    if (e.type !== "transfer") continue;
    const list = approvedByRetailer.get(e.retailer_id) ?? [];
    const idx = list.findIndex(
      (a) =>
        Math.abs(a.amt - Number(e.amount)) < 0.01 &&
        Math.abs(new Date(a.date).getTime() - new Date(e.txn_date).getTime()) <= 7 * 86400e3,
    );
    if (idx === -1) {
      unmatchedEod++;
      if (e.txn_date >= d30 && retailerById.has(e.retailer_id)) {
        const agg = offApp.get(e.retailer_id) ?? { transfers: 0, amount: 0 };
        agg.transfers++;
        agg.amount += Number(e.amount);
        offApp.set(e.retailer_id, agg);
      }
    } else list.splice(idx, 1);
  }
  const appUsage = [...offApp.entries()]
    .map(([rid, agg]) => ({
      name: retailerById.get(rid)?.full_name ?? "?",
      code: retailerById.get(rid)?.retailer_code ?? "",
      transfers: agg.transfers,
      amount: agg.amount,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  /* ---- hygiene alerts ---- */
  const dayMs = 86400e3;
  const staleRequests = requests
    .filter(
      (r) => r.fos_status === "pending" && now.getTime() - new Date(r.created_at).getTime() > dayMs,
    )
    .map((r) => ({
      retailer: retailerById.get(r.retailer_id)?.full_name ?? "?",
      fos: fosById.get(r.fos_id)?.full_name ?? "—",
      amount: Number(r.requested_amount),
      hours: Math.round((now.getTime() - new Date(r.created_at).getTime()) / 3600e3),
    }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 6);
  const staleCash = cash
    .filter(
      (c) => c.status === "pending" && now.getTime() - new Date(c.created_at).getTime() > dayMs,
    )
    .map((c) => ({
      retailer: retailerById.get(c.retailer_id)?.full_name ?? "?",
      amount: Number(c.amount),
      hours: Math.round((now.getTime() - new Date(c.created_at).getTime()) / 3600e3),
    }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 6);

  const lastPayment = new Map<string, string>();
  for (const c of cash) {
    if (c.status !== "approved") continue;
    const prev = lastPayment.get(c.retailer_id);
    if (!prev || c.txn_date > prev) lastPayment.set(c.retailer_id, c.txn_date);
  }
  const d14 = istDate(new Date(now.getTime() - 14 * dayMs));
  const noPayment14d = retailers
    .filter((r) => (perRetailer.get(r.id) ?? 0) > 0)
    .filter((r) => {
      const lp = lastPayment.get(r.id);
      return !lp || lp < d14;
    })
    .map((r) => ({
      name: r.full_name,
      code: r.retailer_code ?? "",
      outstanding: perRetailer.get(r.id) ?? 0,
    }))
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 6);

  const neverLoggedIn = retailers.filter((r) => r.active && r.must_change_password).length;

  /* ---- amount discrepancies (last 30 days) ---- */
  const reqDiscrepancies = requests
    .filter(
      (r) =>
        r.distributor_status !== "pending" &&
        r.distributor_acted_at &&
        istDate(new Date(r.distributor_acted_at)) >= d30 &&
        retailerById.has(r.retailer_id) &&
        (Number(r.fos_amount ?? r.requested_amount) !== Number(r.requested_amount) ||
          Number(r.final_amount ?? r.fos_amount ?? r.requested_amount) !==
            Number(r.requested_amount)),
    )
    .map((r) => ({
      retailer: retailerById.get(r.retailer_id)?.full_name ?? "?",
      code: retailerById.get(r.retailer_id)?.retailer_code ?? "",
      date: istDate(new Date(r.distributor_acted_at!)),
      requested: Number(r.requested_amount),
      fosAmount: r.fos_amount !== null ? Number(r.fos_amount) : null,
      final: Number(r.final_amount ?? r.fos_amount ?? r.requested_amount),
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  const cashDiscrepancies = cash
    .filter(
      (c) =>
        c.status !== "pending" &&
        c.submitted_by === c.retailer_id && // only the retailer's own claims
        c.approved_at &&
        istDate(new Date(c.approved_at)) >= d30 &&
        retailerById.has(c.retailer_id) &&
        (c.status === "declined" ||
          (c.approved_amount !== null && Number(c.approved_amount) !== Number(c.amount))),
    )
    .map((c) => ({
      retailer: retailerById.get(c.retailer_id)?.full_name ?? "?",
      code: retailerById.get(c.retailer_id)?.retailer_code ?? "",
      date: istDate(new Date(c.approved_at!)),
      claimed: Number(c.amount),
      received: c.status === "declined" ? 0 : Number(c.approved_amount ?? c.amount),
      declined: c.status === "declined",
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  return {
    asOf: now.toISOString(),
    pulse: { today: pulseFor(today), yesterday: pulseFor(yesterday) },
    outstanding: {
      total: totalOutstanding,
      byAccount: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        amount: byAccount.get(a.id) ?? 0,
      })),
      series,
    },
    aging: {
      buckets: (["0-7", "8-15", "16-30", "30+"] as const).map((label) => ({
        label,
        amount: Math.round(buckets[label]),
      })),
      topOverdue,
    },
    slowPayers,
    fos: fosCards,
    recon: {
      matched: diffPairs === 0 && unmatchedEod === 0,
      diffAmount: Math.round(diffAmount),
      diffPairs,
      unmatchedEod,
    },
    appUsage,
    alerts: { staleRequests, staleCash, noPayment14d, neverLoggedIn },
    discrepancies: { requests: reqDiscrepancies, cash: cashDiscrepancies },
  };
}
