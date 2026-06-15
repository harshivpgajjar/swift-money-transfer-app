import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Send, Banknote, Clock } from "lucide-react-native";
import { LinenScreen } from "../../components/LinenScreen";
import { Topbar, SectionLabel } from "../../components/linen";
import {
  Segmented,
  Card,
  Row,
  Badge,
  Empty,
  type BadgeTone,
} from "../../components/linen/extras";
import { DTable, type DCell } from "../../components/linen/more";
import { useAuth } from "../../lib/auth";
import { fetchAccounts } from "../../lib/accounts";
import { getRetailerHistory } from "../../lib/queries";
import { supabase } from "../../lib/supabase";
import { useRealtimeRefresh } from "../../lib/realtime";
import { useT, format as fmt } from "../../lib/i18n";
import { T as TH, font } from "../../lib/theme";
import type { Account, ApprovalStatus, RequestFosStatus } from "../../lib/types";
import { formatINR } from "../../lib/format";

type DailyRow = {
  balance_date: string;
  opening: string | number;
  transferred: string | number;
  reversed: string | number;
  cash_received: string | number;
  closing: string | number;
};

export default function RetailerHistory() {
  const { profile } = useAuth();
  const { t, locale } = useT();
  const params = useLocalSearchParams<{ account?: string }>();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof getRetailerHistory>>>({
    requests: [],
    cash: [],
    eod: [],
  });
  const [dailies, setDailies] = useState<DailyRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile?.distributor_id) return;
    const list = await fetchAccounts(profile.distributor_id);
    setAccounts(list);
    let acct = accountId;
    if (!acct) {
      acct = params.account
        ? list.find((a) => a.slug === params.account)?.id ?? list[0]?.id ?? null
        : list[0]?.id ?? null;
      setAccountId(acct);
    }
    if (!acct) return;

    const [h, d] = await Promise.all([
      getRetailerHistory(profile.id, acct),
      supabase
        .from("daily_balances")
        .select("balance_date, opening, transferred, reversed, cash_received, closing")
        .eq("retailer_id", profile.id)
        .eq("account_id", acct)
        .order("balance_date", { ascending: false })
        .limit(30),
    ]);
    setHistory(h);
    setDailies((d.data ?? []) as DailyRow[]);
  }, [profile, accountId, params.account]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(
    profile?.id
      ? [
          { table: "money_requests", filter: `retailer_id=eq.${profile.id}` },
          { table: "cash_submissions", filter: `retailer_id=eq.${profile.id}` },
          { table: "daily_balances", filter: `retailer_id=eq.${profile.id}` },
          { table: "eod_transactions", filter: `retailer_id=eq.${profile.id}` },
        ]
      : [],
    load,
  );

  if (!profile) return null;

  const dailyRows: DCell[][] = dailies.map((d) => [
    { text: formatShortDate(d.balance_date) },
    { text: k(d.opening) },
    Number(d.transferred)
      ? { text: "+" + k(d.transferred), tone: "pos" as const }
      : { text: "—", tone: "mute" as const },
    Number(d.reversed)
      ? { text: "−" + k(d.reversed), tone: "neg" as const }
      : { text: "—", tone: "mute" as const },
    Number(d.cash_received)
      ? { text: "−" + k(d.cash_received), tone: "neg" as const }
      : { text: "—", tone: "mute" as const },
    { text: k(d.closing, true), tone: "close" as const },
  ]);

  const eodRows: DCell[][] = history.eod.map((e) => {
    const rev = e.type === "reversal";
    return [
      { text: formatShortDate(e.txn_date) },
      { text: e.type, tone: rev ? ("neg" as const) : ("pos" as const), ui: true },
      {
        text: (rev ? "−" : "+") + formatINR(e.amount).replace(/^₹/, ""),
        tone: rev ? ("neg" as const) : ("pos" as const),
      },
      { text: e.bank_reference ?? "—", tone: "mute" as const },
    ];
  });

  return (
    <LinenScreen
      topbar={<Topbar title={t("history.title")} locale={locale} />}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
    >
      <Segmented
        options={accounts.map((a) => ({ value: a.id, label: a.name }))}
        value={accountId ?? ""}
        onChange={setAccountId}
        locale={locale}
      />

      <SectionLabel locale={locale}>{t("history.daily")}</SectionLabel>
      <Card style={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 4 }}>
        <DTable
          headers={[
            t("history.col.date"),
            t("history.col.open"),
            t("history.col.in"),
            t("history.col.rev"),
            t("history.col.cash"),
            t("history.col.close"),
          ]}
          rows={dailyRows}
          locale={locale}
        />
      </Card>

      <SectionLabel locale={locale}>
        {fmt(t("history.requests"), { n: history.requests.length })}
      </SectionLabel>
      {history.requests.length === 0 ? (
        <Empty
          icon={<Send size={26} color={TH.ink3} />}
          title={t("history.empty.requests")}
          locale={locale}
        />
      ) : (
        history.requests.map((r) => {
          const adjusted =
            r.fos_amount !== null &&
            Number(r.fos_amount) !== Number(r.requested_amount);
          const fb = fosBadge(r.fos_status, t);
          const db = distBadge(r.fos_status, r.distributor_status, t);
          return (
            <Row
              key={r.id}
              title={
                <Text>
                  {formatINR(r.final_amount ?? r.fos_amount ?? r.requested_amount)}
                  {adjusted ? (
                    <Text
                      style={{
                        fontFamily: font(500, locale),
                        fontSize: 12.5,
                        color: TH.ink3,
                      }}
                    >
                      {" · "}
                      {fmt(t("history.adjusted_by_fos"), {
                        req: formatINR(r.requested_amount),
                      })}
                    </Text>
                  ) : null}
                </Text>
              }
              sub={formatShortDateTime(r.created_at)}
              right={
                <View style={{ gap: 5 }}>
                  <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                    <Badge tone={fb.tone} locale={locale}>
                      {fb.label}
                    </Badge>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                    <Badge tone={db.tone} locale={locale}>
                      {db.label}
                    </Badge>
                  </View>
                </View>
              }
              locale={locale}
            />
          );
        })
      )}

      <SectionLabel locale={locale}>
        {fmt(t("history.cash"), { n: history.cash.length })}
      </SectionLabel>
      {history.cash.length === 0 ? (
        <Empty
          icon={<Banknote size={26} color={TH.ink3} />}
          title={t("history.empty.cash")}
          locale={locale}
        />
      ) : (
        history.cash.map((c) => {
          const cb = cashBadge(c.status, t);
          return (
            <Row
              key={c.id}
              title={formatINR(c.approved_amount ?? c.amount)}
              sub={fmt(t("history.txn_submitted"), {
                txn: formatShortDate(c.txn_date),
                time: formatShortDateTime(c.created_at),
              })}
              right={
                <Badge tone={cb.tone} locale={locale}>
                  {cb.label}
                </Badge>
              }
              locale={locale}
            />
          );
        })
      )}

      <SectionLabel locale={locale}>
        {fmt(t("history.eod"), { n: history.eod.length })}
      </SectionLabel>
      {history.eod.length === 0 ? (
        <Empty
          icon={<Clock size={26} color={TH.ink3} />}
          title={t("history.empty.eod")}
          locale={locale}
        />
      ) : (
        <Card style={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 4 }}>
          <DTable
            headers={[
              t("history.col.date"),
              t("history.col.type"),
              t("history.col.amount"),
              t("history.col.ref"),
            ]}
            rows={eodRows}
            locale={locale}
          />
        </Card>
      )}
    </LinenScreen>
  );
}

/* ── helpers ─────────────────────────────────────────────── */

function k(n: string | number, oneDecimal = false) {
  const v = Number(n) / 1000;
  return oneDecimal ? v.toFixed(1) + "k" : Math.round(v).toString() + "k";
}

function formatShortDate(d: string) {
  const m = new Date(d);
  return m.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function formatShortDateTime(d: string) {
  const m = new Date(d);
  return m.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

type TFn = (key: string) => string;

function fosBadge(s: RequestFosStatus, t: TFn): { tone: BadgeTone; label: string } {
  switch (s) {
    case "pending":
      return { tone: "warn", label: t("status.pending") };
    case "accepted":
      return { tone: "ok", label: t("status.accepted") };
    case "edited":
      return { tone: "ok", label: t("status.fos_edited") };
    case "declined":
      return { tone: "neg", label: t("status.declined") };
  }
}

function distBadge(
  fos: RequestFosStatus,
  dist: ApprovalStatus,
  t: TFn,
): { tone: BadgeTone; label: string } {
  if (fos === "declined") return { tone: "mute", label: "—" };
  if (fos === "pending") return { tone: "mute", label: t("status.awaiting_fos") };
  if (dist === "approved") return { tone: "ok", label: t("status.approved") };
  if (dist === "declined") return { tone: "neg", label: t("status.declined") };
  return { tone: "warn", label: t("status.pending") };
}

function cashBadge(s: ApprovalStatus, t: TFn): { tone: BadgeTone; label: string } {
  if (s === "approved") return { tone: "ok", label: t("status.approved") };
  if (s === "declined") return { tone: "neg", label: t("status.declined") };
  return { tone: "warn", label: t("status.pending") };
}
