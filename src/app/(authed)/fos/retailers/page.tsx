import { requireRole } from "@/lib/auth";
import { getRetailerSummariesByDate, type RetailerSummary, type DateRange } from "@/lib/queries";
import { getAccountsForDistributor } from "@/lib/accounts";
import { createClient } from "@/lib/supabase/server";
import { todayIso, isoAddDays } from "@/lib/format";
import OutstandingView, { type OutRow } from "../../distributor/outstanding/outstanding-view";

const ALL = "all";

async function todayFlow(distributorId: string, fosId: string, accountId: string | null) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("org_day_flow", {
    p_distributor: distributorId,
    p_day: todayIso(),
    p_fos: fosId,
    p_retailer: null,
    p_account: accountId,
  });
  const r = Array.isArray(data) ? data[0] : data;
  return {
    transferred: Number(r?.transferred ?? 0),
    reversed: Number(r?.reversed ?? 0),
    cash: Number(r?.cash ?? 0),
  };
}

function resolveRange(sp: { range?: string; from?: string; to?: string }): {
  preset: string;
  range: DateRange;
} {
  const today = todayIso();
  const yesterday = isoAddDays(today, -1);
  switch (sp.range) {
    case "today":
      return { preset: "today", range: { from: today, to: today } };
    case "full":
      return { preset: "full", range: { from: "1900-01-01", to: today } };
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

function baseRow(s: RetailerSummary): OutRow {
  return {
    id: s.id,
    code: s.retailer_code ?? "",
    name: s.full_name,
    fos: s.fos_name,
    needsFos: s.needs_assignment,
    inactive: !s.active,
    opening: s.opening ?? 0,
    transferred: s.total_transferred,
    reversed: s.total_reversed,
    cash: s.total_cash,
    outstanding: s.outstanding,
    defaulted: s.defaulted ?? false,
    atRisk: s.atRisk ?? false,
    personal: s.personal ?? false,
  };
}

function splitPersonal(rows: OutRow[]): { rows: OutRow[]; personalTotal: number } {
  const personalTotal = rows
    .filter((r) => r.personal)
    .reduce((s, r) => s + r.outstanding, 0);
  return { rows: rows.filter((r) => !r.personal), personalTotal };
}

export default async function FosRetailersPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; range?: string; from?: string; to?: string }>;
}) {
  const me = await requireRole("fos");
  if (!me.distributor_id) return null;
  const distId = me.distributor_id;

  const accounts = await getAccountsForDistributor(distId);
  if (accounts.length === 0) return null;

  const accountMeta = accounts.map((a) => ({ id: a.id, slug: a.slug, name: a.name }));
  const sp = await searchParams;
  const { preset, range } = resolveRange(sp);

  const single =
    sp.account && sp.account !== ALL ? accounts.find((a) => a.slug === sp.account) : undefined;

  // Common props: read-only (no Adjust), no FOS filter, FOS route for navigation.
  const viewBase = {
    accounts: accountMeta,
    preset,
    from: range.from,
    to: range.to,
    canAdjust: false,
    hideFosFilter: true,
    basePath: "/fos/retailers",
  };

  if (single) {
    const [summaries, todayPulse] = await Promise.all([
      getRetailerSummariesByDate(distId, single.id, range, me.id),
      todayFlow(distId, me.id, single.id),
    ]);
    const { rows, personalTotal } = splitPersonal(summaries.map(baseRow));
    return (
      <OutstandingView
        {...viewBase}
        activeSlug={single.slug}
        activeName={single.name}
        accountId={single.id}
        combined={false}
        todayPulse={todayPulse}
        personalTotal={personalTotal}
        rows={rows}
      />
    );
  }

  const perAccount = await Promise.all(
    accounts.map((a) =>
      getRetailerSummariesByDate(distId, a.id, range, me.id).then((s) => ({ a, s })),
    ),
  );

  const merged = new Map<string, OutRow>();
  for (const { a, s } of perAccount) {
    for (const r of s) {
      const cur =
        merged.get(r.id) ??
        ({ ...baseRow(r), opening: 0, transferred: 0, reversed: 0, cash: 0, outstanding: 0, splits: [] } as OutRow);
      cur.opening += r.opening ?? 0;
      cur.transferred += r.total_transferred;
      cur.reversed += r.total_reversed;
      cur.cash += r.total_cash;
      cur.outstanding += r.outstanding;
      cur.defaulted = cur.defaulted || (r.defaulted ?? false);
      cur.atRisk = cur.atRisk || (r.atRisk ?? false);
      if ((r.opening ?? 0) || r.total_transferred || r.total_reversed || r.total_cash || r.outstanding) {
        cur.splits!.push({
          slug: a.slug,
          name: a.name,
          opening: r.opening ?? 0,
          transferred: r.total_transferred,
          reversed: r.total_reversed,
          cash: r.total_cash,
          outstanding: r.outstanding,
        });
      }
      merged.set(r.id, cur);
    }
  }

  const todayPulse = await todayFlow(distId, me.id, null);
  const { rows, personalTotal } = splitPersonal(Array.from(merged.values()));
  return (
    <OutstandingView
      {...viewBase}
      activeSlug={ALL}
      activeName="A2Z + Swift"
      accountId={null}
      combined
      todayPulse={todayPulse}
      personalTotal={personalTotal}
      rows={rows}
    />
  );
}
