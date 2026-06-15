import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Wallet, Inbox, Users, Settings } from "lucide-react-native";
import { LinenScreen } from "../../components/LinenScreen";
import {
  Topbar,
  IconBtn,
  Tile,
  SectionLabel,
  Btn,
  Bold,
} from "../../components/linen";
import { HelperNote } from "../../components/linen/extras";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { useRealtimeRefresh } from "../../lib/realtime";
import { useT, format as fmt } from "../../lib/i18n";
import { formatINR } from "../../lib/format";
import { T as TH, font } from "../../lib/theme";

export default function FosHome() {
  const { profile } = useAuth();
  const { t, locale } = useT();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [pendingInbox, setPendingInbox] = useState(0);
  const [retailerCount, setRetailerCount] = useState(0);
  const [outstanding, setOutstanding] = useState(0);

  const load = useCallback(async () => {
    if (!profile) return;
    const [pi, rc, balances] = await Promise.all([
      supabase
        .from("money_requests")
        .select("id", { count: "exact", head: true })
        .eq("fos_id", profile.id)
        .eq("fos_status", "pending"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("fos_id", profile.id)
        .eq("role", "retailer"),
      supabase
        .from("daily_balances")
        .select("retailer_id, account_id, balance_date, closing")
        .order("balance_date", { ascending: false }),
    ]);
    setPendingInbox(pi.count ?? 0);
    setRetailerCount(rc.count ?? 0);
    const seen = new Set<string>();
    let total = 0;
    for (const b of balances.data ?? []) {
      const key = `${b.retailer_id}|${b.account_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      total += Number(b.closing);
    }
    setOutstanding(total);
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(
    profile?.id
      ? [
          { table: "money_requests", filter: `fos_id=eq.${profile.id}` },
          { table: "daily_balances" },
        ]
      : [],
    load,
  );

  if (!profile) return null;

  return (
    <LinenScreen
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
      topbar={
        <Topbar
          title={t("fos.title")}
          sub={fmt(t("fos.welcome"), { name: profile.full_name })}
          locale={locale}
          right={
            <IconBtn onPress={() => router.push("/settings" as never)}>
              <Settings size={18} color={TH.ink} />
            </IconBtn>
          }
        />
      }
    >
      {/* Hero stat: their outstanding (white card, rLg — design .hero-stat) */}
      <View
        style={{
          backgroundColor: TH.surface,
          borderWidth: 1,
          borderColor: TH.border,
          borderRadius: TH.rLg,
          padding: 20,
          shadowColor: "#28322d",
          shadowOpacity: 0.08,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
          elevation: 2,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              backgroundColor: TH.accentSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Wallet size={20} color={TH.accentInk} />
          </View>
          <View
            style={{
              paddingHorizontal: 9,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: TH.accentSoft,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontFamily: font(700, locale),
                color: TH.accentInk,
              }}
            >
              {fmt(t("fos.tile.retailer_count"), { n: retailerCount })}
            </Text>
          </View>
        </View>
        <Text
          style={{
            fontSize: 13.5,
            fontFamily: font(600, locale),
            color: TH.ink2,
          }}
        >
          {t("fos.tile.outstanding")}
        </Text>
        <Text
          style={{
            fontFamily: font(600, "en", "num"),
            fontSize: 40,
            color: TH.ink,
            letterSpacing: -0.8,
            lineHeight: 46,
            marginTop: 4,
          }}
        >
          {formatINR(outstanding)}
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 13, marginTop: 13 }}>
        <Tile
          icon={<Inbox size={20} color={TH.accentInk} />}
          label={t("fos.tile.pending_inbox")}
          value={String(pendingInbox)}
          onPress={() => router.push("/(fos)/inbox" as never)}
          locale={locale}
        />
        <Tile
          icon={<Users size={20} color={TH.accentInk} />}
          label={t("fos.tile.my_retailers")}
          value={String(retailerCount)}
          onPress={() => router.push("/(fos)/retailers" as never)}
          locale={locale}
        />
      </View>

      <SectionLabel locale={locale}>{t("fos.quick_actions")}</SectionLabel>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Btn
          title={t("fos.btn.inbox")}
          icon={<Inbox size={19} color={TH.onAccent} />}
          vertical
          onPress={() => router.push("/(fos)/inbox" as never)}
          locale={locale}
        />
        <Btn
          title={t("fos.btn.cash")}
          icon={<Wallet size={19} color={TH.ink} />}
          vertical
          variant="ghost"
          onPress={() => router.push("/(fos)/cash" as never)}
          locale={locale}
        />
      </View>

      {profile.fos_auto_approve && (
        <View style={{ marginTop: 20 }}>
          <HelperNote locale={locale}>
            <AutoApproveNote text={t("fos.auto_approve_on")} locale={locale} />
          </HelperNote>
        </View>
      )}
    </LinenScreen>
  );
}

/* "<b>Auto-approve is on.</b> rest…" — bold lead-in sentence per design */
function AutoApproveNote({
  text,
  locale,
}: {
  text: string;
  locale: "en" | "hi" | "gu";
}) {
  const m = text.match(/^(.*?[.।])\s+([\s\S]*)$/);
  if (!m) return <>{text}</>;
  return (
    <>
      <Bold locale={locale}>{m[1]}</Bold> {m[2]}
    </>
  );
}
