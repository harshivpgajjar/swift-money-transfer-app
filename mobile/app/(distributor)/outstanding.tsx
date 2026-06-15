import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { ChevronRight, Wallet } from "lucide-react-native";
import { LinenScreen } from "../../components/LinenScreen";
import { Topbar, Btn } from "../../components/linen";
import {
  Card,
  Segmented,
  Empty,
  Badge,
  Lead,
  Field,
  InlineErr,
  OutLine,
} from "../../components/linen/extras";
import {
  DTable,
  type DCell,
  Selectt,
  Toast,
  type ToastState,
} from "../../components/linen/more";
import { useAuth } from "../../lib/auth";
import { fetchAccounts } from "../../lib/accounts";
import {
  getDistributorRetailerSummaries,
  type RetailerSummary,
} from "../../lib/queries";
import { supabase } from "../../lib/supabase";
import { useRealtimeRefresh } from "../../lib/realtime";
import { useT, format as fmt, type Locale } from "../../lib/i18n";
import { formatINR, formatDate } from "../../lib/format";
import { T as TH, font } from "../../lib/theme";
import type { Account } from "../../lib/types";

type DailyRow = {
  balance_date: string;
  opening: string | number;
  transferred: string | number;
  reversed: string | number;
  cash_received: string | number;
  closing: string | number;
};

export default function Outstanding() {
  const { profile } = useAuth();
  const { t, locale } = useT();
  const [refreshing, setRefreshing] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [rows, setRows] = useState<RetailerSummary[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, DailyRow[]>>({});
  const [toast, setToast] = useState<ToastState>(null);
  const [query, setQuery] = useState("");
  const [fosFilter, setFosFilter] = useState("__all__");
  const [minAmt, setMinAmt] = useState("");
  const [sortBy, setSortBy] = useState<"amount" | "name">("amount");
  const [exportErr, setExportErr] = useState("");

  const load = useCallback(async () => {
    if (!profile) return;
    const list = await fetchAccounts(profile.id);
    setAccounts(list);
    let aid = accountId;
    if (!aid && list.length) {
      aid = list[0].id;
      setAccountId(aid);
    }
    if (aid) {
      const summaries = await getDistributorRetailerSummaries(profile.id, aid);
      setRows(summaries);
    }
  }, [profile, accountId]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(
    profile?.id
      ? [
          { table: "daily_balances" },
          { table: "money_requests", filter: `distributor_id=eq.${profile.id}` },
          { table: "cash_submissions", filter: `distributor_id=eq.${profile.id}` },
        ]
      : [],
    load,
  );

  if (!profile) return null;

  const fosNames = (
    Array.from(new Set(rows.map((r) => r.fos_name).filter(Boolean))) as string[]
  ).sort();

  const filtered = rows
    .filter((r) => {
      if (query) {
        const q = query.trim().toLowerCase();
        if (
          q &&
          !r.full_name.toLowerCase().includes(q) &&
          !(r.retailer_code ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      if (fosFilter === "__none__" && r.fos_name) return false;
      if (fosFilter !== "__all__" && fosFilter !== "__none__" && r.fos_name !== fosFilter)
        return false;
      if (minAmt && r.outstanding < Number(minAmt)) return false;
      return true;
    })
    .sort((a, b) =>
      sortBy === "amount"
        ? b.outstanding - a.outstanding
        : a.full_name.localeCompare(b.full_name),
    );

  const filteredTotal = filtered.reduce((s, r) => s + r.outstanding, 0);
  const withDues = filtered.filter((r) => r.outstanding > 0).length;
  const inAdvance = filtered.filter((r) => r.outstanding < 0).length;

  async function loadDetail(retailerId: string) {
    if (!accountId) return;
    const { data } = await supabase
      .from("daily_balances")
      .select("balance_date, opening, transferred, reversed, cash_received, closing")
      .eq("retailer_id", retailerId)
      .eq("account_id", accountId)
      .order("balance_date", { ascending: false })
      .limit(30);
    setDetails((d) => ({ ...d, [retailerId]: (data ?? []) as DailyRow[] }));
  }

  async function toggle(retailerId: string) {
    if (expanded === retailerId) {
      setExpanded(null);
      return;
    }
    setExpanded(retailerId);
    if (!details[retailerId]) await loadDetail(retailerId);
  }

  async function onAdjusted(retailerId: string) {
    setToast({ msg: t("out.adjust.done") });
    setDetails({});
    await Promise.all([load(), loadDetail(retailerId)]);
  }

  const accountName = accounts.find((a) => a.id === accountId)?.name ?? "";

  async function exportCsv() {
    setExportErr("");
    try {
      const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
      const lines = ["Code,Retailer,FOS,Transferred,Reversed,Cash,Outstanding"];
      for (const r of filtered) {
        lines.push(
          [
            esc(r.retailer_code ?? ""),
            esc(r.full_name),
            esc(r.fos_name ?? "—"),
            r.total_transferred,
            r.total_reversed,
            r.total_cash,
            r.outstanding,
          ].join(","),
        );
      }
      lines.push(
        `TOTAL,"","",${filtered.reduce((s, r) => s + r.total_transferred, 0)},${filtered.reduce(
          (s, r) => s + r.total_reversed,
          0,
        )},${filtered.reduce((s, r) => s + r.total_cash, 0)},${filteredTotal}`,
      );
      const csv = lines.join("\n");

      if (!(await Sharing.isAvailableAsync())) {
        setExportErr("Sharing is not available on this device");
        return;
      }
      const slug =
        accounts.find((a) => a.id === accountId)?.slug ?? accountId ?? "account";
      const file = new File(
        Paths.cache,
        `outstanding-${slug}-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      file.create({ overwrite: true, intermediates: true });
      file.write(csv);
      await Sharing.shareAsync(file.uri, { mimeType: "text/csv" });
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <LinenScreen
        refreshing={refreshing}
        onRefresh={async () => {
          setRefreshing(true);
          await load();
          setRefreshing(false);
        }}
        topbar={<Topbar title={t("out.title")} locale={locale} />}
      >
        <Lead locale={locale}>{t("out.lead")}</Lead>

        <Segmented
          options={accounts.map((a) => ({ value: a.id, label: a.name }))}
          value={accountId ?? ""}
          onChange={setAccountId}
          locale={locale}
        />

        <View style={{ height: 13 }} />

        {rows.length > 0 ? (
          <Card
            style={{
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 12,
              marginBottom: 13,
            }}
          >
            <Field
              label={t("out.filter.search")}
              value={query}
              onChangeText={setQuery}
              placeholder="Nakoda / M9825…"
              locale={locale}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Selectt
                  label={t("out.filter.fos")}
                  value={fosFilter}
                  onChange={setFosFilter}
                  options={[
                    { value: "__all__", label: t("out.filter.all_fos") },
                    ...fosNames.map((f) => ({ value: f, label: f })),
                    { value: "__none__", label: t("out.filter.unassigned") },
                  ]}
                  locale={locale}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label={t("out.filter.min")}
                  value={minAmt}
                  onChangeText={(v) => setMinAmt(v.replace(/[^\d]/g, ""))}
                  keyboardType="numeric"
                  locale={locale}
                />
              </View>
            </View>
            <Segmented
              options={[
                { value: "amount", label: t("out.sort.amount") },
                { value: "name", label: t("out.sort.name") },
              ]}
              value={sortBy}
              onChange={(v) => setSortBy(v as "amount" | "name")}
              locale={locale}
            />
            <View style={{ height: 10 }} />
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <Text
                style={{
                  flexShrink: 1,
                  fontSize: 12.5,
                  fontFamily: font(500, locale),
                  color: TH.ink3,
                }}
              >
                {fmt(t("out.filtered"), {
                  n: filtered.length,
                  total: rows.length,
                  amount: formatINR(filteredTotal),
                })}
                {" · "}
                <Text style={{ color: TH.warn, fontFamily: font(700, locale) }}>
                  {fmt(t("out.with_dues"), { n: withDues })}
                </Text>
                {inAdvance > 0 ? (
                  <Text style={{ color: TH.pos, fontFamily: font(700, locale) }}>
                    {" · "}
                    {fmt(t("out.advance"), { n: inAdvance })}
                  </Text>
                ) : null}
              </Text>
              <Pressable
                onPress={exportCsv}
                disabled={!filtered.length}
                style={{
                  marginLeft: "auto",
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderWidth: 1,
                  borderColor: TH.border2,
                  backgroundColor: TH.surface,
                  opacity: filtered.length ? 1 : 0.5,
                }}
              >
                <Text style={{ fontSize: 13, fontFamily: font(700, locale), color: TH.ink }}>
                  {t("out.export")}
                </Text>
              </Pressable>
            </View>
            {exportErr ? <InlineErr locale={locale}>{exportErr}</InlineErr> : null}
          </Card>
        ) : null}

        {filtered.length === 0 ? (
          <Empty
            icon={<Wallet size={26} color={TH.ink3} />}
            title={fmt(t("out.empty"), {
              account: accounts.find((a) => a.id === accountId)?.name ?? "",
            })}
            locale={locale}
          />
        ) : (
          <>
            {filtered.map((r) => (
              <OutItem
                key={r.id}
                r={r}
                open={expanded === r.id}
                onToggle={() => toggle(r.id)}
                daily={details[r.id] ?? []}
                accountId={accountId ?? ""}
                accountName={accountName}
                onAdjusted={() => onAdjusted(r.id)}
                locale={locale}
              />
            ))}
            {/* Total KV row */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                paddingVertical: 9,
                marginTop: 4,
                borderTopWidth: 1.5,
                borderTopColor: TH.border2,
              }}
            >
              <Text style={{ fontSize: 13, color: TH.ink2, fontFamily: font(500, locale) }}>
                {fmt(t("out.total"), { n: filtered.length })}
              </Text>
              <Text
                style={{
                  fontSize: 13.5,
                  color: TH.ink,
                  fontFamily: font(700, "en", "num"),
                }}
              >
                {formatINR(filteredTotal)}
              </Text>
            </View>
          </>
        )}
      </LinenScreen>
      <Toast toast={toast} onDone={() => setToast(null)} locale={locale} bottom={24} />
    </View>
  );
}

function OutItem({
  r,
  open,
  onToggle,
  daily,
  accountId,
  accountName,
  onAdjusted,
  locale,
}: {
  r: RetailerSummary;
  open: boolean;
  onToggle: () => void;
  daily: DailyRow[];
  accountId: string;
  accountName: string;
  onAdjusted: () => void;
  locale: Locale;
}) {
  const { t } = useT();
  const [adjusting, setAdjusting] = useState(false);

  const tableRows: DCell[][] = daily.slice(0, 14).map((d) => [
    { text: formatDate(d.balance_date) },
    { text: kk(d.opening) },
    Number(d.transferred)
      ? { text: "+" + kk(d.transferred), tone: "pos" as const }
      : { text: "—", tone: "mute" as const },
    Number(d.reversed)
      ? { text: "−" + kk(d.reversed), tone: "neg" as const }
      : { text: "—", tone: "mute" as const },
    Number(d.cash_received)
      ? { text: "−" + kk(d.cash_received), tone: "neg" as const }
      : { text: "—", tone: "mute" as const },
    { text: kk(d.closing, true), tone: "close" as const },
  ]);

  return (
    <View
      style={{
        backgroundColor: TH.surface,
        borderWidth: 1,
        borderColor: TH.border,
        borderRadius: TH.rMd,
        marginBottom: 9,
        overflow: "hidden",
        shadowColor: "#28322d",
        shadowOpacity: 0.08,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
        elevation: 2,
      }}
    >
      <Pressable
        onPress={onToggle}
        android_ripple={{ color: TH.border }}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          padding: 14,
        }}
      >
        <View style={{ width: 22, alignItems: "flex-start" }}>
          <ChevronRight
            size={18}
            color={TH.ink3}
            style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 7,
              flexWrap: "wrap",
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: 15,
                fontFamily: font(700, locale),
                letterSpacing: -0.15,
                color: TH.ink,
                flexShrink: 1,
              }}
            >
              {r.full_name}
            </Text>
            {r.needs_assignment ? (
              <Badge tone="warn" locale={locale}>
                {t("users.status.needs_fos")}
              </Badge>
            ) : null}
            {!r.active ? (
              <Badge tone="mute" locale={locale}>
                {t("fosret.inactive")}
              </Badge>
            ) : null}
          </View>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 12,
              color: TH.ink2,
              marginTop: 2,
              fontFamily: font(500, locale),
            }}
          >
            {r.retailer_code ?? "—"} · {r.fos_name ?? t("users.fos_unassigned")}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text
            style={{
              fontFamily: font(700, "en", "num"),
              fontSize: 17,
              color: TH.ink,
            }}
          >
            {formatINR(r.outstanding)}
          </Text>
          <Text
            style={{
              fontSize: 10.5,
              color: TH.ink3,
              textTransform: "uppercase",
              letterSpacing: 0.42,
              fontFamily: font(600, locale),
            }}
          >
            {t("out.col.outstanding")}
          </Text>
        </View>
      </Pressable>

      {open ? (
        <View
          style={{
            paddingHorizontal: 14,
            paddingBottom: 14,
            paddingTop: 2,
            borderTopWidth: 1,
            borderTopColor: TH.border,
          }}
        >
          <View style={{ flexDirection: "row", gap: 8, marginVertical: 14 }}>
            <Mini l={t("out.col.transferred")} v={formatINR(r.total_transferred)} tone="pos" locale={locale} />
            <Mini l={t("out.col.reversed")} v={formatINR(r.total_reversed)} tone="neg" locale={locale} />
            <Mini l={t("out.col.cash")} v={formatINR(r.total_cash)} tone="neg" locale={locale} />
            <Mini l={t("out.col.outstanding")} v={formatINR(r.outstanding)} locale={locale} />
          </View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              marginBottom: 12,
            }}
          >
            <Pressable
              onPress={() => setAdjusting(true)}
              style={({ pressed }) => ({
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: TH.surface2,
                borderWidth: 1,
                borderColor: TH.border2,
                transform: pressed ? [{ scale: 0.95 }] : [],
              })}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: font(700, locale),
                  color: TH.ink,
                }}
                numberOfLines={1}
              >
                {t("out.adjust")}
              </Text>
            </Pressable>
          </View>
          {adjusting ? (
            <AdjustModal
              r={r}
              accountId={accountId}
              accountName={accountName}
              onClose={() => setAdjusting(false)}
              onDone={() => {
                setAdjusting(false);
                onAdjusted();
              }}
              locale={locale}
            />
          ) : null}
          <DTable
            headers={[
              t("history.col.date"),
              t("history.col.open"),
              t("history.col.in"),
              t("history.col.rev"),
              t("history.col.cash"),
              t("history.col.close"),
            ]}
            rows={tableRows}
            locale={locale}
          />
        </View>
      ) : null}
    </View>
  );
}

function AdjustModal({
  r,
  accountId,
  accountName,
  onClose,
  onDone,
  locale,
}: {
  r: RetailerSummary;
  accountId: string;
  accountName: string;
  onClose: () => void;
  onDone: () => void;
  locale: Locale;
}) {
  const { t } = useT();
  const [target, setTarget] = useState(String(Math.round(r.outstanding)));
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr("");
    setBusy(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/api/outstanding/adjust`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          retailer_id: r.id,
          account_id: accountId,
          target: Number(target),
          notes,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || json.error) {
        const e = json.error ?? `HTTP ${res.status}`;
        setErr(e === "no_change" ? t("out.adjust.no_change") : e);
        setConfirming(false);
        setBusy(false);
        return;
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setConfirming(false);
      setBusy(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(28,38,32,0.4)",
          justifyContent: "center",
          padding: 20,
        }}
        onPress={onClose}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: TH.surface,
            borderRadius: TH.rXl,
            padding: 22,
          }}
        >
          <Text
            style={{
              fontSize: 17,
              fontFamily: font(800, locale),
              letterSpacing: -0.2,
              color: TH.ink,
            }}
          >
            {t("out.adjust.title")}
          </Text>
          <Text
            style={{
              fontSize: 12.5,
              color: TH.ink2,
              marginTop: 3,
              fontFamily: font(500, locale),
            }}
          >
            {r.full_name} · {accountName}
          </Text>
          <OutLine
            left={t("out.adjust.current")}
            right={formatINR(r.outstanding)}
            locale={locale}
          />
          <View style={{ height: 14 }} />
          {confirming ? (
            <>
              <Text
                style={{
                  fontSize: 14.5,
                  lineHeight: 21,
                  color: TH.ink2,
                  fontFamily: font(500, locale),
                  marginBottom: 4,
                }}
              >
                {fmt(t("out.adjust.confirm"), {
                  name: r.full_name,
                  account: accountName,
                  from: formatINR(r.outstanding),
                  to: formatINR(Number(target)),
                })}
              </Text>
              {err ? <InlineErr locale={locale}>{err}</InlineErr> : null}
              <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
                <Btn
                  title={t("common.cancel")}
                  variant="ghost"
                  onPress={() => setConfirming(false)}
                  locale={locale}
                />
                <Btn
                  title={t("common.confirm")}
                  onPress={submit}
                  loading={busy}
                  busyLabel="…"
                  locale={locale}
                />
              </View>
            </>
          ) : (
            <>
              <Field
                label={t("out.adjust.target")}
                value={target}
                onChangeText={(v) => setTarget(v.replace(/[^\d-]/g, ""))}
                prefix="₹"
                keyboardType="numeric"
                inputProps={{ autoFocus: true }}
                locale={locale}
              />
              <Field
                label={t("appr.notes")}
                value={notes}
                onChangeText={setNotes}
                placeholder={t("out.adjust.note_hint")}
                locale={locale}
              />
              {err ? <InlineErr locale={locale}>{err}</InlineErr> : null}
              <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                <Btn
                  title={t("common.cancel")}
                  variant="ghost"
                  onPress={onClose}
                  locale={locale}
                />
                <Btn
                  title={t("out.adjust")}
                  onPress={() => setConfirming(true)}
                  disabled={target === "" || Number(target) === Math.round(r.outstanding)}
                  locale={locale}
                />
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Mini({
  l,
  v,
  tone,
  locale,
}: {
  l: string;
  v: string;
  tone?: "pos" | "neg";
  locale: Locale;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: TH.surface2,
        borderRadius: TH.rSm,
        padding: 10,
        minWidth: 0,
      }}
    >
      <Text
        numberOfLines={1}
        style={{
          fontSize: 10.5,
          color: TH.ink3,
          textTransform: "uppercase",
          letterSpacing: 0.42,
          fontFamily: font(600, locale),
        }}
      >
        {l}
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{
          fontFamily: font(700, "en", "num"),
          fontSize: 15,
          marginTop: 3,
          color: tone === "pos" ? TH.pos : tone === "neg" ? TH.neg : TH.ink,
        }}
      >
        {v}
      </Text>
    </View>
  );
}

function kk(n: string | number, oneDecimal = false) {
  const v = Number(n) / 1000;
  return oneDecimal ? v.toFixed(1) + "k" : Math.round(v).toString() + "k";
}
