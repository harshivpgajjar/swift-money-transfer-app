import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, Linking, ScrollView } from "react-native";
import { CircleCheck, Phone } from "lucide-react-native";
import { LinenScreen } from "./LinenScreen";
import { Topbar } from "./linen";
import { Card, Empty } from "./linen/extras";
import { supabase } from "../lib/supabase";
import { getActionCenter, type ActionRow } from "../lib/queries";
import { useRealtimeRefresh } from "../lib/realtime";
import { useT, format as fmt } from "../lib/i18n";
import { formatINR, formatDate } from "../lib/format";
import { T as TH, font } from "../lib/theme";

type Grp = "active" | "atrisk" | "blocked";
function grpOf(b: ActionRow["bucket"]): Grp {
  if (b === "defaulter") return "blocked";
  if (b === "atrisk") return "atrisk";
  return "active";
}

export function ActionCenter({ distributorId, fosId }: { distributorId: string; fosId?: string }) {
  const { t, locale } = useT();
  const [rows, setRows] = useState<ActionRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const canFilterFos = !fosId;
  const [fosList, setFosList] = useState<{ id: string; name: string }[]>([]);
  const [fosFilter, setFosFilter] = useState<string>("__all__");

  const load = useCallback(async () => {
    setRows(await getActionCenter(distributorId, fosId));
  }, [distributorId, fosId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!canFilterFos) return;
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("distributor_id", distributorId)
      .eq("role", "fos")
      .order("full_name")
      .then(({ data }) => setFosList((data ?? []).map((f) => ({ id: f.id, name: f.full_name }))));
  }, [canFilterFos, distributorId]);

  useRealtimeRefresh([{ table: "daily_balances" }, { table: "eod_transactions" }], load);

  const visible = rows.filter((r) =>
    fosFilter === "__all__" ? true : fosFilter === "__none__" ? !r.fos_id : r.fos_id === fosFilter,
  );
  const byAmt = (a: ActionRow, b: ActionRow) => b.outstanding - a.outstanding;
  const active = visible.filter((r) => grpOf(r.bucket) === "active").sort(byAmt);
  const atrisk = visible.filter((r) => grpOf(r.bucket) === "atrisk").sort(byAmt);
  const blocked = visible.filter((r) => grpOf(r.bucket) === "blocked").sort(byAmt);
  const total3pm = visible.reduce((s, r) => s + r.outstanding, 0);
  const refDay = rows[0]?.ref_day;

  const Row = ({ r, muted }: { r: ActionRow; muted: boolean }) => (
    <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 9, borderBottomWidth: 0.5, borderBottomColor: TH.border }}>
      <Text style={{ flex: 1, fontSize: 13.5, color: TH.ink2 }} numberOfLines={1}>{r.full_name}</Text>
      <Text style={{ width: 92, textAlign: "right", fontSize: 13.5, fontFamily: font(700, "en", "num"), color: muted ? TH.ink2 : TH.neg }}>
        {formatINR(r.outstanding)}
      </Text>
      <Text style={{ width: 76, textAlign: "right", fontSize: 12, fontFamily: font(400, "en", "num"), color: TH.ink3 }}>
        {formatINR(r.full_pending)}
      </Text>
      <View style={{ width: 38, alignItems: "flex-end" }}>
        {r.phone ? (
          <Pressable
            onPress={() => Linking.openURL(`tel:${r.phone}`)}
            accessibilityLabel={`Call ${r.full_name}`}
            style={{ width: 30, height: 30, borderRadius: 999, alignItems: "center", justifyContent: "center", borderWidth: 0.5, borderColor: TH.border }}
          >
            <Phone size={14} color={TH.accentInk} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const GroupHeader = ({ color, label }: { color: string; label: string }) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14, paddingTop: 9, borderTopWidth: 0.5, borderTopColor: TH.border }}>
      <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: color }} />
      <Text style={{ fontSize: 10.5, color, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <LinenScreen
        refreshing={refreshing}
        onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
        topbar={<Topbar title={t("nav.action")} locale={locale} />}
      >
        {canFilterFos && fosList.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
            {[{ id: "__all__", name: t("out.filter.all_fos") }, ...fosList, { id: "__none__", name: t("out.filter.unassigned") }].map((f) => {
              const on = fosFilter === f.id;
              return (
                <Pressable key={f.id} onPress={() => setFosFilter(f.id)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 0.5, borderColor: on ? TH.accentInk : TH.border }}>
                  <Text style={{ fontSize: 12.5, color: on ? TH.accentInk : TH.ink3, fontFamily: font(on ? 700 : 500, locale) }}>{f.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <Text style={{ fontSize: 12.5, color: TH.ink3, fontFamily: font(500, locale), marginBottom: 10 }}>
          {t("act.head")} <Text style={{ color: TH.neg, fontFamily: font(700, "en", "num") }}>{formatINR(total3pm)}</Text>
          {refDay ? `  ·  ${fmt(t("act.asof"), { date: formatDate(refDay) })}` : ""}
        </Text>

        {visible.length === 0 ? (
          <Empty icon={<CircleCheck size={26} color={TH.ink3} />} title={t("act.allclear")} />
        ) : (
          <Card style={{ paddingHorizontal: 14, paddingTop: 4, paddingBottom: 10 }}>
            <View style={{ flexDirection: "row", paddingVertical: 6 }}>
              <Text style={{ flex: 1, fontSize: 10, color: TH.ink3, letterSpacing: 0.4 }}>{t("act.col.retailer").toUpperCase()}</Text>
              <Text style={{ width: 92, textAlign: "right", fontSize: 10, color: TH.ink3, letterSpacing: 0.4 }}>{t("act.col.till").toUpperCase()}</Text>
              <Text style={{ width: 76, textAlign: "right", fontSize: 10, color: TH.ink3, letterSpacing: 0.4 }}>{t("act.col.full").toUpperCase()}</Text>
              <View style={{ width: 38 }} />
            </View>
            {active.map((r) => <Row key={r.retailer_id} r={r} muted={false} />)}
            {atrisk.length > 0 ? <GroupHeader color={TH.warn} label={`${t("act.atrisk")} · ${t("act.atrisk.sub")}`} /> : null}
            {atrisk.map((r) => <Row key={r.retailer_id} r={r} muted />)}
            {blocked.length > 0 ? <GroupHeader color={TH.ink3} label={`${t("act.blocked")} · ${t("act.defaulters.sub")}`} /> : null}
            {blocked.map((r) => <Row key={r.retailer_id} r={r} muted />)}
          </Card>
        )}
      </LinenScreen>
    </View>
  );
}
