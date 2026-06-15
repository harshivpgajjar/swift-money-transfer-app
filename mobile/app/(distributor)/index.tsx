import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  Wallet,
  Send,
  Banknote,
  Users as UsersIcon,
  User,
  Bell,
  Check,
  Settings,
} from "lucide-react-native";
import Svg, { Polyline } from "react-native-svg";
import { LinenScreen } from "../../components/LinenScreen";
import { Topbar, Tile, IconBtn, SectionLabel } from "../../components/linen";
import { Card, KV, Badge, Divider } from "../../components/linen/extras";
import { DistributorActivity } from "../../components/distributor-activity";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { useRealtimeRefresh } from "../../lib/realtime";
import { useT, format as fmt } from "../../lib/i18n";
import { formatDate, formatINR } from "../../lib/format";
import { T as TH, font } from "../../lib/theme";

/* Shape returned by GET /api/analytics/distributor (src/lib/analytics.ts). */
type AnalyticsData = {
  asOf: string;
  pulse: {
    today: { disbursed: number; collected: number; net: number };
    yesterday: { disbursed: number; collected: number; net: number };
  };
  outstanding: {
    total: number;
    byAccount: { id: string; name: string; amount: number }[];
    series: { date: string; total: number }[];
  };
  aging: {
    buckets: { label: "0-7" | "8-15" | "16-30" | "30+"; amount: number }[];
    topOverdue: { name: string; code: string; amount: number; days: number }[];
  };
  slowPayers: {
    name: string;
    code: string;
    outstanding: number;
    avgDays: number | null;
    oldestDays: number;
  }[];
  fos: {
    name: string;
    outstanding: number;
    collected7d: number;
    pendingRequests: number;
    pendingCash: number;
    avgResponseHours: number | null;
  }[];
  recon: { matched: boolean; diffAmount: number; diffPairs: number; unmatchedEod: number };
  /* May be absent in older API responses. */
  appUsage?: { name: string; code: string; transfers: number; amount: number }[];
  discrepancies?: {
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

async function fetchAnalytics(): Promise<AnalyticsData | null> {
  try {
    const base = process.env.EXPO_PUBLIC_API_URL;
    if (!base) return null;
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return null;
    const res = await fetch(`${base}/api/analytics/distributor`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as AnalyticsData;
  } catch {
    return null;
  }
}

export default function DistributorHome() {
  const { profile } = useAuth();
  const { t, locale } = useT();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    pendingReq: 0,
    pendingCash: 0,
    retailers: 0,
    fos: 0,
    needsAssignment: 0,
    outstanding: 0,
  });
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const [pr, pc, rc, fc, na, balances, an] = await Promise.all([
      supabase
        .from("money_requests")
        .select("id", { count: "exact", head: true })
        .eq("distributor_id", profile.id)
        .eq("distributor_status", "pending")
        .in("fos_status", ["accepted", "edited"]),
      supabase
        .from("cash_submissions")
        .select("id", { count: "exact", head: true })
        .eq("distributor_id", profile.id)
        .eq("status", "pending"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("distributor_id", profile.id)
        .eq("role", "retailer"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("distributor_id", profile.id)
        .eq("role", "fos"),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("distributor_id", profile.id)
        .eq("role", "retailer")
        .eq("needs_assignment", true),
      supabase
        .from("daily_balances")
        .select("retailer_id, account_id, balance_date, closing")
        .order("balance_date", { ascending: false }),
      fetchAnalytics(),
    ]);
    const seen = new Set<string>();
    let total = 0;
    for (const b of balances.data ?? []) {
      const key = `${b.retailer_id}|${b.account_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      total += Number(b.closing);
    }
    setStats({
      pendingReq: pr.count ?? 0,
      pendingCash: pc.count ?? 0,
      retailers: rc.count ?? 0,
      fos: fc.count ?? 0,
      needsAssignment: na.count ?? 0,
      outstanding: total,
    });
    setAnalytics(an);
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(
    profile?.id
      ? [
          { table: "money_requests", filter: `distributor_id=eq.${profile.id}` },
          { table: "cash_submissions", filter: `distributor_id=eq.${profile.id}` },
          { table: "daily_balances" },
          { table: "profiles", filter: `distributor_id=eq.${profile.id}` },
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
          title={t("dist.title")}
          sub={fmt(t("dist.welcome"), { name: profile.full_name })}
          locale={locale}
          right={
            <IconBtn onPress={() => router.push("/settings" as never)}>
              <Settings size={18} color={TH.ink} />
            </IconBtn>
          }
        />
      }
    >
      {/* Hero stat: total outstanding + "View outstanding" chip */}
      <View
        style={{
          backgroundColor: TH.surface,
          borderWidth: 1,
          borderColor: TH.border,
          borderRadius: TH.rLg,
          padding: 20,
          marginBottom: 13,
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
          <Pressable
            onPress={() => router.push("/(distributor)/outstanding" as never)}
            style={({ pressed }) => ({
              paddingHorizontal: 9,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: TH.accentSoft,
              transform: pressed ? [{ scale: 0.96 }] : [],
            })}
          >
            <Text
              style={{
                fontSize: 11,
                fontFamily: font(700, locale),
                color: TH.accentInk,
                lineHeight: 14,
              }}
            >
              {t("dist.view_outstanding")}
            </Text>
          </Pressable>
        </View>
        <Text
          style={{
            fontSize: 13.5,
            fontFamily: font(600, locale),
            color: TH.ink2,
          }}
        >
          {t("dist.tile.outstanding")}
        </Text>
        <Text
          style={{
            fontFamily: font(600, "en", "num"),
            fontSize: 40,
            color: TH.ink,
            letterSpacing: -0.8,
            marginTop: 4,
          }}
        >
          {formatINR(stats.outstanding)}
        </Text>
      </View>

      {/* 5 tiles in a 2-column grid */}
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Tile
          icon={<Send size={20} color={TH.accentInk} />}
          label={t("dist.tile.req")}
          value={String(stats.pendingReq)}
          onPress={() => router.push("/(distributor)/approvals" as never)}
          locale={locale}
        />
        <Tile
          icon={<Banknote size={20} color={TH.accentInk} />}
          label={t("dist.tile.cash")}
          value={String(stats.pendingCash)}
          onPress={() => router.push("/(distributor)/approvals" as never)}
          locale={locale}
        />
      </View>

      <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
        <Tile
          icon={<UsersIcon size={20} color={TH.accentInk} />}
          label={t("dist.tile.retailers")}
          value={String(stats.retailers)}
          onPress={() => router.push("/(distributor)/users" as never)}
          locale={locale}
        />
        <Tile
          icon={<User size={20} color={TH.accentInk} />}
          label={t("dist.tile.fos")}
          value={String(stats.fos)}
          onPress={() => router.push("/(distributor)/users" as never)}
          locale={locale}
        />
      </View>

      <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
        <Tile
          icon={<Bell size={20} color={TH.accentInk} />}
          label={t("dist.tile.assign")}
          value={String(stats.needsAssignment)}
          chip={stats.needsAssignment > 0 ? t("dist.action") : undefined}
          onPress={() => router.push("/(distributor)/users" as never)}
          locale={locale}
        />
        <View style={{ flex: 1 }} />
      </View>

      {/* Analytics dashboard (renders nothing while loading / on failure) */}
      {analytics ? <Analytics data={analytics} /> : null}
    </LinenScreen>
  );
}

/* ============================================================
   Analytics dashboard — mirrors web distributor/analytics-view
   ============================================================ */

const BUCKET_COLORS: Record<string, string> = {
  "0-7": TH.accent,
  "8-15": "#8FBF6F",
  "16-30": TH.warn,
  "30+": TH.neg,
};

function Mini({
  label,
  value,
  tone,
  dot,
  locale,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
  dot?: string;
  locale: ReturnType<typeof useT>["locale"];
}) {
  return (
    <View style={{ width: "50%", paddingVertical: 5 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        {dot ? (
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
        ) : null}
        <Text
          style={{
            fontSize: 10.5,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            color: TH.ink3,
            fontFamily: font(700, locale),
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      <Text
        style={{
          fontSize: 15,
          fontFamily: font(700, "en", "num"),
          color: tone === "neg" ? TH.neg : tone === "pos" ? TH.pos : TH.ink,
          marginTop: 2,
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

/* KV-style row whose sides hold arbitrary nodes (badges, muted spans). */
function KVRow({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        paddingVertical: 9,
        borderTopWidth: 1,
        borderTopColor: TH.border,
      }}
    >
      {left}
      {right}
    </View>
  );
}

function Analytics({ data }: { data: AnalyticsData }) {
  const { t, locale } = useT();
  const { pulse, outstanding, aging, slowPayers, fos, recon, alerts } = data;
  const discrepancies = data.discrepancies ?? { requests: [], cash: [] };
  const discCount = discrepancies.requests.length + discrepancies.cash.length;
  const appUsage = data.appUsage ?? [];

  const agingTotal = aging.buckets.reduce((s, b) => s + b.amount, 0);
  const alertCount =
    alerts.staleRequests.length +
    alerts.staleCash.length +
    alerts.noPayment14d.length +
    (alerts.neverLoggedIn > 0 ? 1 : 0);
  const reconOk = recon.matched && recon.unmatchedEod === 0;

  /* polyline points for the 30d series (normalized into 300×56) */
  const series = outstanding.series;
  const min = Math.min(...series.map((p) => p.total));
  const max = Math.max(...series.map((p) => p.total));
  const range = max - min || 1;
  const points = series
    .map((p, i) => {
      const x = (i / Math.max(series.length - 1, 1)) * 300;
      const y = 56 - 8 - ((p.total - min) / range) * 40;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const numStyle = {
    fontSize: 13.5,
    color: TH.ink,
    fontFamily: font(600, "en", "num"),
  } as const;
  const leftStyle = {
    flex: 1,
    fontSize: 13,
    color: TH.ink2,
    fontFamily: font(500, locale),
  } as const;
  const mutedStyle = {
    fontSize: 12,
    color: TH.ink3,
    fontFamily: font(500, locale),
    marginTop: 1,
  } as const;

  return (
    <View>
      {/* ---- live activity ---- */}
      <SectionLabel locale={locale}>{t("act.title")}</SectionLabel>
      <DistributorActivity locale={locale} />

      {/* ---- daily pulse ---- */}
      <SectionLabel locale={locale}>{t("an.today")}</SectionLabel>
      <Card>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          <Mini
            label={t("an.disbursed")}
            value={formatINR(pulse.today.disbursed)}
            tone="neg"
            locale={locale}
          />
          <Mini
            label={t("an.collected")}
            value={formatINR(pulse.today.collected)}
            tone="pos"
            locale={locale}
          />
          <Mini
            label={t("an.net")}
            value={(pulse.today.net > 0 ? "+" : "") + formatINR(pulse.today.net)}
            tone={pulse.today.net > 0 ? "neg" : "pos"}
            locale={locale}
          />
          <Mini
            label={t("an.yesterday") + " · " + t("an.net")}
            value={(pulse.yesterday.net > 0 ? "+" : "") + formatINR(pulse.yesterday.net)}
            locale={locale}
          />
        </View>
      </Card>

      {/* ---- health: recon + alerts ---- */}
      <SectionLabel locale={locale}>
        {alertCount ? fmt(t("an.alerts"), { n: alertCount }) : t("an.all_clear")}
      </SectionLabel>
      <Card>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            backgroundColor: TH.surface2,
            borderRadius: TH.rSm,
            padding: 10,
            marginBottom: alertCount ? 4 : 0,
          }}
        >
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              backgroundColor: reconOk ? TH.accentSoft : "rgba(183, 121, 31, 0.16)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {reconOk ? (
              <Check size={17} color={TH.accentInk} />
            ) : (
              <Bell size={17} color={TH.warn} />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{ fontSize: 14.5, fontFamily: font(700, locale), color: TH.ink }}
            >
              {recon.matched
                ? t("an.recon_ok")
                : fmt(t("an.recon_diff"), {
                    amt: recon.diffAmount.toLocaleString("en-IN"),
                    n: recon.diffPairs,
                  })}
            </Text>
            {recon.unmatchedEod > 0 ? (
              <Text
                style={{
                  fontSize: 12.5,
                  color: TH.ink2,
                  marginTop: 2,
                  fontFamily: font(500, locale),
                }}
              >
                {fmt(t("an.unmatched_eod"), { n: recon.unmatchedEod })}
              </Text>
            ) : null}
          </View>
        </View>

        {alerts.staleRequests.map((a, i) => (
          <KV
            key={"sr" + i}
            k={a.retailer + " · " + fmt(t("an.alert.req_stale"), { h: a.hours, fos: a.fos })}
            v={formatINR(a.amount)}
            locale={locale}
          />
        ))}
        {alerts.staleCash.map((a, i) => (
          <KV
            key={"sc" + i}
            k={a.retailer + " · " + fmt(t("an.alert.cash_stale"), { h: a.hours })}
            v={formatINR(a.amount)}
            locale={locale}
          />
        ))}
        {alerts.noPayment14d.map((a, i) => (
          <KV
            key={"np" + i}
            k={a.name + " · " + t("an.alert.no_payment")}
            v={formatINR(a.outstanding)}
            locale={locale}
          />
        ))}
        {alerts.neverLoggedIn > 0 ? (
          <KV
            k={fmt(t("an.alert.never_logged"), { n: alerts.neverLoggedIn })}
            v=""
            locale={locale}
          />
        ) : null}
      </Card>

      {/* ---- amount discrepancies ---- */}
      <SectionLabel locale={locale}>{fmt(t("an.disc"), { n: discCount })}</SectionLabel>
      <Card>
        <Text
          style={{
            fontSize: 12.5,
            color: TH.ink2,
            lineHeight: 19,
            fontFamily: font(500, locale),
          }}
        >
          {t("an.disc.note")}
        </Text>
        {discrepancies.requests.map((d, i) => {
          const diff = d.final - d.requested;
          return (
            <KVRow
              key={"dr" + i}
              left={
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={leftStyle} numberOfLines={1}>
                    {d.retailer}
                  </Text>
                  <Text style={mutedStyle} numberOfLines={2}>
                    {formatDate(d.date) +
                      " · " +
                      fmt(t("an.disc.req_chain"), {
                        x: formatINR(d.requested),
                        y: d.fosAmount !== null ? formatINR(d.fosAmount) : "—",
                        z: formatINR(d.final),
                      })}
                  </Text>
                </View>
              }
              right={
                <Text style={[numStyle, { color: diff < 0 ? TH.neg : TH.pos }]}>
                  {(diff > 0 ? "+" : "") + formatINR(diff)}
                </Text>
              }
            />
          );
        })}
        {discrepancies.cash.map((d, i) => (
          <KVRow
            key={"dc" + i}
            left={
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <Text style={leftStyle} numberOfLines={1}>
                    {d.retailer}
                  </Text>
                  {d.declined ? (
                    <Badge tone="neg" locale={locale}>
                      {t("an.disc.declined")}
                    </Badge>
                  ) : null}
                </View>
                <Text style={mutedStyle} numberOfLines={2}>
                  {formatDate(d.date) +
                    " · " +
                    fmt(t("an.disc.cash_chain"), {
                      x: formatINR(d.claimed),
                      y: formatINR(d.received),
                    })}
                </Text>
              </View>
            }
            right={
              <Text style={[numStyle, { color: TH.neg }]}>
                {formatINR(d.received - d.claimed)}
              </Text>
            }
          />
        ))}
        {discCount === 0 ? (
          <Text
            style={{
              fontSize: 12.5,
              color: TH.pos,
              fontFamily: font(500, locale),
              marginTop: 8,
            }}
          >
            {t("an.disc.none")}
          </Text>
        ) : null}
      </Card>

      {/* ---- not using the app (portal transfers without app requests) ---- */}
      <SectionLabel locale={locale}>{fmt(t("an.appuse"), { n: appUsage.length })}</SectionLabel>
      <Card>
        <Text
          style={{
            fontSize: 12.5,
            color: TH.ink2,
            lineHeight: 19,
            fontFamily: font(500, locale),
          }}
        >
          {t("an.appuse.note")}
        </Text>
        {appUsage.map((u, i) => (
          <KVRow
            key={"au" + i}
            left={
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={leftStyle} numberOfLines={1}>
                  {u.name}
                </Text>
                <Text style={mutedStyle} numberOfLines={1}>
                  {u.code + " · " + fmt(t("an.appuse.count"), { n: u.transfers })}
                </Text>
              </View>
            }
            right={<Text style={numStyle}>{formatINR(u.amount)}</Text>}
          />
        ))}
        {appUsage.length === 0 ? (
          <Text
            style={{
              fontSize: 12.5,
              color: TH.pos,
              fontFamily: font(500, locale),
              marginTop: 8,
            }}
          >
            {t("an.appuse.none")}
          </Text>
        ) : null}
      </Card>

      {/* ---- 30-day trend + account split ---- */}
      <SectionLabel locale={locale}>{t("an.trend_30d")}</SectionLabel>
      <Card>
        {series.length > 1 ? (
          <Svg width="100%" height={56} viewBox="0 0 300 56" preserveAspectRatio="none">
            <Polyline
              points={points}
              fill="none"
              stroke={TH.accent}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        ) : null}
        <Divider />
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          <Mini
            label={t("dist.tile.outstanding")}
            value={formatINR(outstanding.total)}
            locale={locale}
          />
          {outstanding.byAccount.map((a) => (
            <Mini key={a.id} label={a.name} value={formatINR(a.amount)} locale={locale} />
          ))}
        </View>
      </Card>

      {/* ---- aging ---- */}
      <SectionLabel locale={locale}>{t("an.aging")}</SectionLabel>
      <Card>
        {agingTotal > 0 ? (
          <View
            style={{
              flexDirection: "row",
              height: 14,
              borderRadius: 999,
              overflow: "hidden",
              marginBottom: 12,
            }}
          >
            {aging.buckets
              .filter((b) => b.amount > 0)
              .map((b) => (
                <View
                  key={b.label}
                  style={{ flex: b.amount, backgroundColor: BUCKET_COLORS[b.label] }}
                />
              ))}
          </View>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {aging.buckets.map((b) => (
            <Mini
              key={b.label}
              label={b.label + " " + t("an.days_lbl")}
              value={formatINR(b.amount)}
              dot={BUCKET_COLORS[b.label]}
              locale={locale}
            />
          ))}
        </View>
        {aging.topOverdue.length > 0 ? (
          <>
            <Divider />
            <Text
              style={{
                fontSize: 10.5,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                color: TH.ink3,
                fontFamily: font(700, locale),
                marginBottom: 6,
              }}
            >
              {t("an.top_overdue")}
            </Text>
            {aging.topOverdue.map((r, i) => (
              <KVRow
                key={i}
                left={
                  <View
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 7,
                      minWidth: 0,
                    }}
                  >
                    <Text style={leftStyle} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Badge
                      tone={r.days > 30 ? "neg" : r.days > 15 ? "warn" : "mute"}
                      locale={locale}
                    >
                      {r.days + " " + t("an.days_lbl")}
                    </Badge>
                  </View>
                }
                right={<Text style={numStyle}>{formatINR(r.amount)}</Text>}
              />
            ))}
          </>
        ) : null}
      </Card>

      {/* ---- slow payers ---- */}
      {slowPayers.length > 0 ? (
        <>
          <SectionLabel locale={locale}>{t("an.slow_payers")}</SectionLabel>
          <Card>
            {slowPayers.map((r, i) => (
              <KVRow
                key={i}
                left={
                  <Text style={leftStyle} numberOfLines={1}>
                    {r.name}
                    {r.avgDays !== null ? (
                      <Text style={{ fontSize: 12, color: TH.ink3 }}>
                        {" · " + fmt(t("an.avg_clear"), { n: r.avgDays })}
                      </Text>
                    ) : null}
                  </Text>
                }
                right={<Text style={numStyle}>{formatINR(r.outstanding)}</Text>}
              />
            ))}
          </Card>
        </>
      ) : null}

      {/* ---- FOS scorecards ---- */}
      <SectionLabel locale={locale}>{t("an.fos_perf")}</SectionLabel>
      {fos.map((f) => (
        <Card key={f.name} style={{ marginBottom: 11 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <Text
              style={{
                flex: 1,
                fontSize: 15,
                fontFamily: font(800, locale),
                color: TH.ink,
              }}
              numberOfLines={1}
            >
              {f.name}
            </Text>
            {f.pendingRequests + f.pendingCash > 0 ? (
              <Badge tone="warn" locale={locale}>
                {`${t("an.pending_items")} ${f.pendingRequests + f.pendingCash}`}
              </Badge>
            ) : null}
          </View>
          <KV
            k={t("dist.tile.outstanding_sheet")}
            v={formatINR(f.outstanding)}
            locale={locale}
          />
          <KV
            k={t("an.collected_7d")}
            v={<Text style={{ color: TH.pos }}>{formatINR(f.collected7d)}</Text>}
            locale={locale}
          />
          <KV
            k={t("an.avg_response")}
            v={f.avgResponseHours !== null ? `${f.avgResponseHours}h` : "—"}
            locale={locale}
          />
        </Card>
      ))}
    </View>
  );
}
