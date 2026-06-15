"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { formatShortDateTime } from "@/lib/format";
import { formatINR } from "@/lib/utils";

/* Live feed of every transaction in the distributor's org — money requests
   (sent / accepted / approved / declined) and cash (submitted / approved /
   declined) — newest first, updating in realtime. Self-contained: reads via
   the browser client (RLS scopes to this distributor) and subscribes to
   postgres changes. */

type Named = { full_name: string; retailer_code: string | null } | null;
type AcctName = { name: string } | null;

type Item = {
  id: string;
  kind: "transfer" | "cash";
  retailer: string;
  code: string;
  account: string;
  amount: number;
  status: "requested" | "awaiting" | "approved" | "declined" | "pending";
  when: string;
};

const TONE: Record<Item["status"], string> = {
  requested: "warn",
  awaiting: "warn",
  pending: "warn",
  approved: "ok",
  declined: "neg",
};

export default function DistributorActivity() {
  const { t } = useT();
  const [items, setItems] = useState<Item[]>([]);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [reqs, cash] = await Promise.all([
      supabase
        .from("money_requests")
        .select(
          "id, requested_amount, fos_amount, final_amount, fos_status, distributor_status, created_at, fos_acted_at, distributor_acted_at, retailer:retailer_id(full_name, retailer_code), account:account_id(name)",
        )
        .order("created_at", { ascending: false })
        .limit(60),
      supabase
        .from("cash_submissions")
        .select(
          "id, amount, approved_amount, status, created_at, approved_at, retailer:retailer_id(full_name, retailer_code), account:account_id(name)",
        )
        .order("created_at", { ascending: false })
        .limit(60),
    ]);

    const merged: Item[] = [];
    for (const r of (reqs.data ?? []) as Record<string, unknown>[]) {
      const rr = r as {
        id: string;
        requested_amount: number;
        fos_amount: number | null;
        final_amount: number | null;
        fos_status: string;
        distributor_status: string;
        created_at: string;
        fos_acted_at: string | null;
        distributor_acted_at: string | null;
        retailer: Named;
        account: AcctName;
      };
      let status: Item["status"] = "requested";
      if (rr.distributor_status === "approved") status = "approved";
      else if (rr.distributor_status === "declined" || rr.fos_status === "declined") status = "declined";
      else if (rr.fos_status === "accepted" || rr.fos_status === "edited") status = "awaiting";
      merged.push({
        id: "r" + rr.id,
        kind: "transfer",
        retailer: rr.retailer?.full_name ?? "?",
        code: rr.retailer?.retailer_code ?? "",
        account: rr.account?.name ?? "",
        amount: Number(rr.final_amount ?? rr.fos_amount ?? rr.requested_amount),
        status,
        when: rr.distributor_acted_at ?? rr.fos_acted_at ?? rr.created_at,
      });
    }
    for (const c of (cash.data ?? []) as Record<string, unknown>[]) {
      const cc = c as {
        id: string;
        amount: number;
        approved_amount: number | null;
        status: string;
        created_at: string;
        approved_at: string | null;
        retailer: Named;
        account: AcctName;
      };
      merged.push({
        id: "c" + cc.id,
        kind: "cash",
        retailer: cc.retailer?.full_name ?? "?",
        code: cc.retailer?.retailer_code ?? "",
        account: cc.account?.name ?? "",
        amount: Number(cc.approved_amount ?? cc.amount),
        status: cc.status === "approved" ? "approved" : cc.status === "declined" ? "declined" : "pending",
        when: cc.approved_at ?? cc.created_at,
      });
    }
    merged.sort((a, b) => b.when.localeCompare(a.when));
    setItems(merged.slice(0, 60));
  }, []);

  useEffect(() => {
    load();
    const supabase = createClient();
    const channel = supabase
      .channel("dist-activity")
      .on("postgres_changes", { event: "*", schema: "public", table: "money_requests" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_submissions" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const statusLabel = (s: Item["status"]) => t("act." + s);

  return (
    <div className="card" style={{ padding: "6px 16px" }}>
      {items.length === 0 && (
        <p className="fmt-list" style={{ margin: "14px 0" }}>{t("act.empty")}</p>
      )}
      {items.map((it) => (
        <div className="kv" key={it.id}>
          <span className="kv-l">
            <span className={"badge " + (it.kind === "cash" ? "ok" : "mute")} style={{ marginRight: 7 }}>
              {it.kind === "cash" ? t("act.cash") : t("act.transfer")}
            </span>
            {it.retailer}
            <span className="muted" style={{ fontSize: 12 }}>
              {" "}· {formatINR(it.amount)} · {it.account} · {formatShortDateTime(it.when)}
            </span>
          </span>
          <span className={"badge " + TONE[it.status]}>{statusLabel(it.status)}</span>
        </div>
      ))}
    </div>
  );
}
