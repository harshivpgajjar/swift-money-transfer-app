import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Users } from "lucide-react-native";
import { LinenScreen } from "../../components/LinenScreen";
import { Topbar } from "../../components/linen";
import { Card, Badge, Empty, KV, Lead } from "../../components/linen/extras";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { fetchAccounts } from "../../lib/accounts";
import { useRealtimeRefresh } from "../../lib/realtime";
import { useT, format as fmt } from "../../lib/i18n";
import { formatINR } from "../../lib/format";
import { T as TH, font } from "../../lib/theme";
import type { Account } from "../../lib/types";

type Row = {
  id: string;
  retailer_code: string | null;
  full_name: string;
  phone: string | null;
  active: boolean;
};

export default function FosRetailers() {
  const { profile } = useAuth();
  const { t, locale } = useT();
  const [refreshing, setRefreshing] = useState(false);
  const [retailers, setRetailers] = useState<Row[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balanceMap, setBalanceMap] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!profile?.distributor_id) return;
    const [accs, rr] = await Promise.all([
      fetchAccounts(profile.distributor_id),
      supabase
        .from("profiles")
        .select("id, retailer_code, full_name, phone, active")
        .eq("fos_id", profile.id)
        .eq("role", "retailer")
        .order("retailer_code"),
    ]);
    setAccounts(accs);
    const list = (rr.data ?? []) as Row[];
    setRetailers(list);

    if (list.length) {
      const ids = list.map((r) => r.id);
      const { data } = await supabase
        .from("daily_balances")
        .select("retailer_id, account_id, balance_date, closing")
        .in("retailer_id", ids)
        .order("balance_date", { ascending: false });
      const m: Record<string, number> = {};
      for (const b of data ?? []) {
        const key = `${b.retailer_id}|${b.account_id}`;
        if (!(key in m)) m[key] = Number(b.closing);
      }
      setBalanceMap(m);
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(profile?.id ? [{ table: "daily_balances" }] : [], load);

  if (!profile) return null;

  return (
    <LinenScreen
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
      topbar={<Topbar title={t("fosret.title")} locale={locale} />}
    >
      <Lead locale={locale}>{fmt(t("fosret.assigned"), { n: retailers.length })}</Lead>
      {retailers.length === 0 ? (
        <Empty
          icon={<Users size={26} color={TH.ink3} />}
          title={t("fosret.empty.title")}
          locale={locale}
        />
      ) : (
        retailers.map((r) => (
          <Card key={r.id} style={{ marginBottom: 11 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    fontSize: 16,
                    fontFamily: font(800, locale),
                    letterSpacing: -0.16,
                    color: TH.ink,
                  }}
                >
                  {r.full_name}
                </Text>
                <Text
                  style={{
                    fontSize: 12.5,
                    fontFamily: font(600, locale),
                    color: TH.ink2,
                    marginTop: 1,
                  }}
                >
                  {r.retailer_code}
                </Text>
              </View>
              <Badge tone={r.active ? "ok" : "mute"} locale={locale}>
                {r.active ? t("fosret.active") : t("fosret.inactive")}
              </Badge>
            </View>
            <View style={{ marginTop: 8 }}>
              <KV k={t("fosret.phone")} v={r.phone ?? "—"} locale={locale} />
              {accounts.map((a) => (
                <KV
                  key={a.id}
                  k={fmt(t("cash.outstanding_for"), { account: a.name })}
                  v={formatINR(balanceMap[`${r.id}|${a.id}`] ?? 0)}
                  locale={locale}
                />
              ))}
            </View>
          </Card>
        ))
      )}
    </LinenScreen>
  );
}
