import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { supabase } from "../lib/supabase";
import { useT } from "../lib/i18n";
import { T, font } from "../lib/theme";
import { formatINR, formatDateTime } from "../lib/format";
import { Card, Badge, type BadgeTone } from "./linen/extras";

/* Live feed of every request + cash payment in the distributor's org,
   newest first, updating in realtime. */
type Item = {
  id: string;
  kind: "transfer" | "cash";
  retailer: string;
  account: string;
  amount: number;
  status: "requested" | "awaiting" | "approved" | "declined" | "pending";
  when: string;
};

const TONE: Record<Item["status"], BadgeTone> = {
  requested: "warn",
  awaiting: "warn",
  pending: "warn",
  approved: "ok",
  declined: "neg",
};

export function DistributorActivity({ locale }: { locale: "en" | "hi" | "gu" }) {
  const { t } = useT();
  const [items, setItems] = useState<Item[]>([]);

  const load = useCallback(async () => {
    const [reqs, cash] = await Promise.all([
      supabase
        .from("money_requests")
        .select(
          "id, requested_amount, fos_amount, final_amount, fos_status, distributor_status, created_at, fos_acted_at, distributor_acted_at, retailer:retailer_id(full_name), account:account_id(name)",
        )
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("cash_submissions")
        .select(
          "id, amount, approved_amount, status, created_at, approved_at, retailer:retailer_id(full_name), account:account_id(name)",
        )
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    const merged: Item[] = [];
    for (const r of (reqs.data ?? []) as Record<string, any>[]) {
      let status: Item["status"] = "requested";
      if (r.distributor_status === "approved") status = "approved";
      else if (r.distributor_status === "declined" || r.fos_status === "declined") status = "declined";
      else if (r.fos_status === "accepted" || r.fos_status === "edited") status = "awaiting";
      merged.push({
        id: "r" + r.id,
        kind: "transfer",
        retailer: r.retailer?.full_name ?? "?",
        account: r.account?.name ?? "",
        amount: Number(r.final_amount ?? r.fos_amount ?? r.requested_amount),
        status,
        when: r.distributor_acted_at ?? r.fos_acted_at ?? r.created_at,
      });
    }
    for (const c of (cash.data ?? []) as Record<string, any>[]) {
      merged.push({
        id: "c" + c.id,
        kind: "cash",
        retailer: c.retailer?.full_name ?? "?",
        account: c.account?.name ?? "",
        amount: Number(c.approved_amount ?? c.amount),
        status: c.status === "approved" ? "approved" : c.status === "declined" ? "declined" : "pending",
        when: c.approved_at ?? c.created_at,
      });
    }
    merged.sort((a, b) => b.when.localeCompare(a.when));
    setItems(merged.slice(0, 50));
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`dist-activity-${Math.random().toString(36).slice(2, 9)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "money_requests" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_submissions" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  return (
    <Card style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 }}>
      {items.length === 0 ? (
        <Text style={{ color: T.ink3, fontFamily: font(500, locale), paddingVertical: 16 }}>
          {t("act.empty")}
        </Text>
      ) : (
        items.map((it, i) => (
          <View
            key={it.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingVertical: 11,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: T.border,
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontSize: 14, fontFamily: font(700, locale), color: T.ink }}>
                {it.retailer}
              </Text>
              <Text numberOfLines={1} style={{ fontSize: 12, fontFamily: font(500, locale), color: T.ink2, marginTop: 1 }}>
                {(it.kind === "cash" ? t("act.cash") : t("act.transfer")) +
                  " · " + formatINR(it.amount) + " · " + it.account + " · " + formatDateTime(it.when)}
              </Text>
            </View>
            <Badge tone={TONE[it.status]} locale={locale}>
              {t("act." + it.status)}
            </Badge>
          </View>
        ))
      )}
    </Card>
  );
}
