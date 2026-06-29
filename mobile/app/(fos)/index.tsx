import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Wallet, Inbox, Users, Settings, AlertTriangle } from "lucide-react-native";
import Svg, { Polyline } from "react-native-svg";
import { LinenScreen } from "../../components/LinenScreen";
import {
  Topbar,
  IconBtn,
  Tile,
  SectionLabel,
  Btn,
  Bold,
} from "../../components/linen";
import { HelperNote, Card, KV } from "../../components/linen/extras";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { useRealtimeRefresh } from "../../lib/realtime";
import { useT, format as fmt } from "../../lib/i18n";
import { formatINR } from "../../lib/format";
import { T as TH, font } from "../../lib/theme";

/* Subset of GET /api/analytics/fos (FOS-scoped) that this screen renders. */
type FosAnalytics = {
  outstanding: { total: number; series: { date: string; total: number }[] };
  aging: {
    buckets: { label: string; amount: number }[];
    topOverdue: { name: string; code: string; amount: number; days: number }[];
  };
  slowPayers: { name: string; code: string; outstanding: number; oldestDays: number }[];
  alerts: {
    staleRequests: { retailer: string; amount: number; hours: number }[];
    staleCash: { retailer: string; amount: number; hours: number }[];
    noPayment14d: { name: string; code: string; outstanding: number }[];
  };
};

async function fetchFosAnalytics(): Promise<FosAnalytics | null> {
  try {
    const base = process.env.EXPO_PUBLIC_API_URL;
    if (!base) return null;
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return null;
    const res = await fetch(`${base}/api/analytics/fos`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as FosAnalytics;
  } catch {
    return null;
  }
}

export default function FosHome() {
  const { profile } = useAuth();
  const { t, locale } = useT();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [pendingInbox, setPendingInbox] = useState(0);
  const [retailerCount, setRetailerCount] = useState(0);
  const [outstanding, setOutstanding] = useState(0);
  const [an, setAn] = useState<FosAnalytics | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const [pi, rc, outRes, analytics] = await Promise.all([
      supabase
        .from("money_requests")
        .select("id", { count: "exact", head: true })
        .eq("fos_id", profile.id)
        .eq("fos_status", "pending"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("fos_id", profile.id)
        .eq("role", "retailer")
        .eq("excluded", false),
      // Server-side latest-balance sum scoped to this FOS — no 1000-row cap.
      supabase.rpc("org_outstanding", {
        p_distributor: profile.distributor_id,
        p_fos: profile.id,
      }),
      fetchFosAnalytics(),
    ]);
    setPendingInbox(pi.count ?? 0);
    setRetailerCount(rc.count ?? 0);
    const total = Number(outRes.data ?? 0);
    setOutstanding(total);
    setAn(analytics);
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

  const heroTotal = an?.outstanding.total ?? outstanding;

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
      {/* Hero stat: their outstanding + 30-day trend */}
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
            <Text style={{ fontSize: 11, fontFamily: font(700, locale), color: TH.accentInk }}>
              {fmt(t("fos.tile.retailer_count"), { n: retailerCount })}
            </Text>
          </View>
        </View>
        <Text style={{ fontSize: 13.5, fontFamily: font(600, locale), color: TH.ink2 }}>
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
          {formatINR(heroTotal)}
        </Text>
        {an && an.outstanding.series.length > 1 ? (
          <Sparkline series={an.outstanding.series} />
        ) : null}
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

      {/* ── Aging ── */}
      {an && an.aging.buckets.some((b) => b.amount > 0) ? (
        <>
          <SectionLabel locale={locale}>{t("fosdash.aging")}</SectionLabel>
          <Card style={{ padding: 16 }}>
            {an.aging.buckets.map((b) => (
              <KV key={b.label} k={fmt(t("fosdash.days"), { d: b.label })} v={formatINR(b.amount)} locale={locale} />
            ))}
          </Card>
        </>
      ) : null}

      {/* ── Top overdue ── */}
      {an && an.aging.topOverdue.length ? (
        <>
          <SectionLabel locale={locale}>{t("fosdash.overdue")}</SectionLabel>
          <Card style={{ padding: 16 }}>
            {an.aging.topOverdue.map((r, i) => (
              <View
                key={r.code || i}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  paddingVertical: 6,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 14, fontFamily: font(700, locale), color: TH.ink }}>
                    {r.name}
                  </Text>
                  <Text style={{ fontSize: 11.5, color: TH.ink3, fontFamily: font(500, locale) }}>
                    {fmt(t("fosdash.days_old"), { n: r.days })}
                  </Text>
                </View>
                <Text style={{ fontFamily: font(700, "en", "num"), fontSize: 14, color: TH.ink }}>
                  {formatINR(r.amount)}
                </Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {/* ── Needs attention ── */}
      {an && (an.alerts.staleRequests.length || an.alerts.staleCash.length || an.alerts.noPayment14d.length) ? (
        <>
          <SectionLabel locale={locale}>{t("fosdash.alerts")}</SectionLabel>
          <Card style={{ padding: 16 }}>
            {an.alerts.staleRequests.map((a, i) => (
              <AlertRow key={"sr" + i} text={fmt(t("fosdash.stale_req"), { name: a.retailer, h: a.hours })} amount={formatINR(a.amount)} locale={locale} />
            ))}
            {an.alerts.staleCash.map((a, i) => (
              <AlertRow key={"sc" + i} text={fmt(t("fosdash.stale_cash"), { name: a.retailer, h: a.hours })} amount={formatINR(a.amount)} locale={locale} />
            ))}
            {an.alerts.noPayment14d.map((a, i) => (
              <AlertRow key={"np" + i} text={fmt(t("fosdash.no_pay"), { name: a.name })} amount={formatINR(a.outstanding)} locale={locale} />
            ))}
          </Card>
        </>
      ) : null}

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

function Sparkline({ series }: { series: { date: string; total: number }[] }) {
  const W = 300;
  const H = 50;
  const vals = series.map((p) => p.total);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const pts = series
    .map((p, i) => {
      const x = (i / (series.length - 1)) * W;
      const y = H - 6 - ((p.total - min) / range) * (H - 12);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <View style={{ marginTop: 12 }}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Polyline points={pts} fill="none" stroke={TH.accentInk} strokeWidth={2} />
      </Svg>
    </View>
  );
}

function AlertRow({
  text,
  amount,
  locale,
}: {
  text: string;
  amount: string;
  locale: "en" | "hi" | "gu";
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 6,
      }}
    >
      <AlertTriangle size={15} color={TH.warn} />
      <Text numberOfLines={2} style={{ flex: 1, fontSize: 12.5, color: TH.ink2, fontFamily: font(500, locale) }}>
        {text}
      </Text>
      <Text style={{ fontFamily: font(700, "en", "num"), fontSize: 13, color: TH.ink }}>{amount}</Text>
    </View>
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
