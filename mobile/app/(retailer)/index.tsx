import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Wallet, ArrowUp, Banknote, Settings, User, Phone } from "lucide-react-native";
import { LinenScreen } from "../../components/LinenScreen";
import {
  Topbar,
  IconBtn,
  Tile,
  SectionLabel,
  Btn,
  WhoCard,
  WhatsAppIcon,
  Bold,
} from "../../components/linen";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { fetchAccounts, fetchLatestClosingPerAccount } from "../../lib/accounts";
import { useRealtimeRefresh } from "../../lib/realtime";
import { useT, format as fmt } from "../../lib/i18n";
import { formatINR, phoneLinks } from "../../lib/format";
import { T as TH, font } from "../../lib/theme";
import type { Account } from "../../lib/types";

function ContactBtn({
  kind,
  onPress,
}: {
  kind: "call" | "wa";
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: kind === "wa" ? "#25D366" : TH.accentSoft,
        transform: pressed ? [{ scale: 0.92 }] : [],
      })}
    >
      {kind === "wa" ? (
        <WhatsAppIcon size={20} color="#fff" />
      ) : (
        <Phone size={18} color={TH.accentInk} />
      )}
    </Pressable>
  );
}

export default function RetailerHome() {
  const { profile } = useAuth();
  const { t, locale } = useT();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [balanceMap, setBalanceMap] = useState<Map<string, number>>(new Map());
  const [pendingRequests, setPendingRequests] = useState(0);
  const [pendingCash, setPendingCash] = useState(0);
  const [fosName, setFosName] = useState<string | null>(null);
  const [fosPhone, setFosPhone] = useState<string | null>(null);
  const [distName, setDistName] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.distributor_id) return;
    const [acct, balances, pr, pc, fos, dist] = await Promise.all([
      fetchAccounts(profile.distributor_id),
      fetchLatestClosingPerAccount(profile.id),
      supabase
        .from("money_requests")
        .select("id", { count: "exact", head: true })
        .eq("retailer_id", profile.id)
        .or("fos_status.eq.pending,distributor_status.eq.pending"),
      supabase
        .from("cash_submissions")
        .select("id", { count: "exact", head: true })
        .eq("retailer_id", profile.id)
        .eq("status", "pending"),
      profile.fos_id
        ? supabase
            .from("profiles")
            .select("full_name, phone")
            .eq("id", profile.fos_id)
            .maybeSingle()
        : Promise.resolve({ data: null as { full_name: string; phone: string | null } | null }),
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", profile.distributor_id)
        .maybeSingle(),
    ]);
    setAccounts(acct);
    setBalanceMap(balances);
    setPendingRequests(pr.count ?? 0);
    setPendingCash(pc.count ?? 0);
    setFosName(fos.data?.full_name ?? null);
    setFosPhone(fos.data?.phone ?? null);
    setDistName(dist.data?.full_name ?? null);
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(
    profile?.id
      ? [
          { table: "money_requests", filter: `retailer_id=eq.${profile.id}` },
          { table: "cash_submissions", filter: `retailer_id=eq.${profile.id}` },
          { table: "daily_balances", filter: `retailer_id=eq.${profile.id}` },
        ]
      : [],
    load,
  );

  if (!profile) return null;

  const subLine = fmt(t("retailer.sub"), {
    code: profile.retailer_code ?? "—",
    fos: fosName ?? "—",
    distributor: distName ?? "",
  });

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
          title={profile.full_name}
          sub={subLine}
          locale={locale}
          right={
            <IconBtn onPress={() => router.push("/settings" as never)}>
              <Settings size={18} color={TH.ink} />
            </IconBtn>
          }
        />
      }
    >
      {/* Account outstanding feature tiles (full-width, stacked) */}
      <View style={{ gap: 13 }}>
        {accounts.map((a, i) => (
          <Tile
            key={a.id}
            feature
            icon={<Wallet size={20} color={TH.accentInk} />}
            label={fmt(t("retailer.tile.outstanding"), { account: a.name })}
            value={formatINR(balanceMap.get(a.id) ?? 0)}
            chip={i === 0 ? t("retailer.tile.tap_to_view") : undefined}
            onPress={() => router.push(`/(retailer)/history?account=${a.slug}` as never)}
            locale={locale}
          />
        ))}

        {/* Pending tiles (side by side) */}
        <View style={{ flexDirection: "row", gap: 13 }}>
          <Tile
            icon={<ArrowUp size={20} color={TH.accentInk} />}
            label={t("retailer.tile.pending_requests")}
            value={String(pendingRequests)}
            onPress={() => router.push("/(retailer)/history" as never)}
            locale={locale}
          />
          <Tile
            icon={<Banknote size={20} color={TH.accentInk} />}
            label={t("retailer.tile.pending_cash")}
            value={String(pendingCash)}
            onPress={() => router.push("/(retailer)/history" as never)}
            locale={locale}
          />
        </View>
      </View>

      <SectionLabel locale={locale}>{t("retailer.quick_actions")}</SectionLabel>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <Btn
          title={t("retailer.btn.request")}
          icon={<ArrowUp size={19} color={TH.onAccent} />}
          vertical
          variant="primary"
          locale={locale}
          onPress={() => router.push("/(retailer)/request")}
        />
        <Btn
          title={t("retailer.btn.cash")}
          icon={<Banknote size={19} color={TH.ink} />}
          vertical
          variant="ghost"
          locale={locale}
          onPress={() => router.push("/(retailer)/cash")}
        />
      </View>

      {fosName ? (
        <WhoCard
          icon={<User size={18} color={TH.accentInk} />}
          line={
            <Text>
              <Bold locale={locale}>{fosName}</Bold>{" "}
              <Text style={{ fontFamily: font(500, locale), color: TH.ink2 }}>
                {t("retailer.fos_line_a")}
              </Text>
            </Text>
          }
          sub={t("retailer.fos_sub")}
          right={(() => {
            const links = phoneLinks(fosPhone);
            if (!links) return null;
            return (
              <>
                <ContactBtn kind="call" onPress={() => Linking.openURL(`tel:${links.tel}`)} />
                <ContactBtn
                  kind="wa"
                  onPress={async () => {
                    const app = `whatsapp://send?phone=${links.wa}`;
                    const web = `https://wa.me/${links.wa}`;
                    const ok = await Linking.canOpenURL(app).catch(() => false);
                    Linking.openURL(ok ? app : web);
                  }}
                />
              </>
            );
          })()}
          locale={locale}
        />
      ) : (
        <WhoCard
          icon={<User size={18} color={TH.accentInk} />}
          line={t("retailer.no_fos")}
          sub=""
          locale={locale}
        />
      )}
    </LinenScreen>
  );
}
