import { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { ChevronRight, Wallet, Calendar } from "lucide-react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { LinenScreen } from "../../components/LinenScreen";
import { Topbar, Btn } from "../../components/linen";
import {
  Card,
  Segmented,
  Empty,
  Badge,
  Field,
  InlineErr,
  OutLine,
} from "../../components/linen/extras";
import { DTable, type DCell, Toast, type ToastState } from "../../components/linen/more";
import { useAuth } from "../../lib/auth";
import { fetchAccounts } from "../../lib/accounts";
import {
  getDistributorRetailerSummariesByDate,
  type RetailerSummary,
  type DateRange,
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

// Sentinel for the combined "A2Z + Swift" view in the account switcher.
const COMBINED = "__all__";

// Shift a YYYY-MM-DD date by N days (UTC, matching the app's date handling).
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type AccountSplit = {
  slug: string;
  name: string;
  opening: number;
  transferred: number;
  reversed: number;
  cash: number;
  outstanding: number;
};

// In combined mode each row carries the per-account breakdown (splits).
type Row = RetailerSummary & { splits?: AccountSplit[] };

async function setDefaulterApi(retailerId: string, on: boolean): Promise<boolean> {
  try {
    const base = process.env.EXPO_PUBLIC_API_URL;
    if (!base) return false;
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) return false;
    const res = await fetch(`${base}/api/outstanding/defaulter`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ retailer_id: retailerId, on }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* Distributor route — full management view. */
export default function DistributorOutstanding() {
  const { profile } = useAuth();
  if (!profile) return null;
  return <OutstandingInner distributorId={profile.id} canManage showSearch />;
}

/* Shared Outstanding screen. Reused (read-only) by the FOS and retailer apps:
   - FOS:      distributorId + fosId      (their retailers, no manage/FOS-filter)
   - Retailer: distributorId + retailerId (own balance, no filters/manage) */
export function OutstandingInner({
  distributorId,
  fosId,
  retailerId,
  canManage = false,
  showSearch = false,
}: {
  distributorId: string;
  fosId?: string;
  retailerId?: string;
  canManage?: boolean;
  showSearch?: boolean;
}) {
  const { t, locale } = useT();
  const [refreshing, setRefreshing] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<string>(COMBINED); // Combined is the default
  const [rows, setRows] = useState<Row[]>([]);
  const [personalTotal, setPersonalTotal] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, DailyRow[]>>({});
  const [toast, setToast] = useState<ToastState>(null);
  const [query, setQuery] = useState("");
  const [exportErr, setExportErr] = useState("");
  // Movement window: "1d" (yesterday, default) | "7d" | "30d" | "full" | "custom".
  const [range, setRange] = useState("1d");
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [picker, setPicker] = useState<null | "from" | "to">(null);
  const [showCustom, setShowCustom] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [pulse, setPulse] = useState<{ transferred: number; reversed: number; cash: number } | null>(
    null,
  );

  const load = useCallback(async () => {
    const list = await fetchAccounts(distributorId);
    setAccounts(list);

    const today = new Date().toISOString().slice(0, 10);

    // Today's flow (transfers/cash) for the current scope — always shown on top.
    supabase
      .rpc("org_day_flow", {
        p_distributor: distributorId,
        p_day: today,
        p_fos: fosId ?? null,
        p_retailer: retailerId ?? null,
        p_account: accountId === COMBINED ? null : accountId,
      })
      .then(({ data }) => {
        const row = Array.isArray(data) ? data[0] : data;
        setPulse({
          transferred: Number(row?.transferred ?? 0),
          reversed: Number(row?.reversed ?? 0),
          cash: Number(row?.cash ?? 0),
        });
      });

    let effRange: DateRange;
    if (range === "today") effRange = { from: today, to: today };
    else if (range === "full") effRange = { from: "1900-01-01", to: today };
    else if (range === "7d") effRange = { from: addDays(today, -6), to: today };
    else if (range === "30d") effRange = { from: addDays(today, -29), to: today };
    else if (range === "custom" && fromInput && toInput)
      effRange =
        fromInput <= toInput
          ? { from: fromInput, to: toInput }
          : { from: toInput, to: fromInput };
    else effRange = { from: addDays(today, -1), to: addDays(today, -1) };

    if (accountId === COMBINED) {
      const per = await Promise.all(
        list.map((a) =>
          getDistributorRetailerSummariesByDate(distributorId, a.id, effRange, fosId, retailerId).then(
            (s) => ({ a, s }),
          ),
        ),
      );
      const merged = new Map<string, Row>();
      for (const { a, s } of per) {
        for (const r of s) {
          const cur =
            merged.get(r.id) ??
            ({ ...r, opening: 0, total_transferred: 0, total_reversed: 0, total_cash: 0, outstanding: 0, splits: [] } as Row);
          cur.opening = (cur.opening ?? 0) + (r.opening ?? 0);
          cur.total_transferred += r.total_transferred;
          cur.total_reversed += r.total_reversed;
          cur.total_cash += r.total_cash;
          cur.outstanding += r.outstanding;
          cur.defaulted = cur.defaulted || !!r.defaulted;
          cur.atRisk = cur.atRisk || !!r.atRisk;
          if ((r.opening ?? 0) || r.total_transferred || r.total_reversed || r.total_cash || r.outstanding) {
            cur.splits!.push({
              slug: a.slug,
              name: a.name,
              opening: r.opening ?? 0,
              transferred: r.total_transferred,
              reversed: r.total_reversed,
              cash: r.total_cash,
              outstanding: r.outstanding,
            });
          }
          merged.set(r.id, cur);
        }
      }
      const allRows = Array.from(merged.values());
      setPersonalTotal(allRows.filter((r) => r.personal).reduce((s, r) => s + r.outstanding, 0));
      setRows(allRows.filter((r) => !r.personal));
    } else {
      const allRows = await getDistributorRetailerSummariesByDate(
        distributorId, accountId, effRange, fosId, retailerId,
      );
      setPersonalTotal(allRows.filter((r) => r.personal).reduce((s, r) => s + r.outstanding, 0));
      setRows(allRows.filter((r) => !r.personal));
    }
  }, [distributorId, fosId, retailerId, accountId, range, fromInput, toInput]);

  useEffect(() => {
    load();
  }, [load]);

  useRealtimeRefresh(
    canManage
      ? [
          { table: "daily_balances" },
          { table: "money_requests", filter: `distributor_id=eq.${distributorId}` },
          { table: "cash_submissions", filter: `distributor_id=eq.${distributorId}` },
        ]
      : [{ table: "daily_balances" }],
    load,
  );

  const isCombined = accountId === COMBINED;

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
      if (statusFilter === "defaulters" && !r.defaulted) return false;
      if (statusFilter === "active" && r.defaulted) return false;
      if (statusFilter === "atrisk" && !r.atRisk) return false;
      return true;
    })
    .sort((a, b) => b.outstanding - a.outstanding);

  const collectibleTotal = rows.filter((r) => !r.defaulted).reduce((s, r) => s + r.outstanding, 0);
  const defaultedTotal = rows.filter((r) => r.defaulted).reduce((s, r) => s + r.outstanding, 0);
  const defaulterCount = rows.filter((r) => r.defaulted).length;
  const atRiskCount = rows.filter((r) => r.atRisk).length;

  const filteredTotal = filtered.reduce((s, r) => s + r.outstanding, 0);
  const withDues = filtered.filter((r) => r.outstanding > 0).length;
  const inAdvance = filtered.filter((r) => r.outstanding < 0).length;

  async function loadDetail(rid: string) {
    if (!accountId) return;
    const { data } = await supabase
      .from("daily_balances")
      .select("balance_date, opening, transferred, reversed, cash_received, closing")
      .eq("retailer_id", rid)
      .eq("account_id", accountId)
      .order("balance_date", { ascending: false })
      .limit(30);
    setDetails((d) => ({ ...d, [rid]: (data ?? []) as DailyRow[] }));
  }

  async function toggle(rid: string) {
    if (expanded === rid) {
      setExpanded(null);
      return;
    }
    setExpanded(rid);
    if (!isCombined && !details[rid]) await loadDetail(rid);
  }

  async function onAdjusted(rid: string) {
    setToast({ msg: t("out.adjust.done") });
    setDetails({});
    await Promise.all([load(), loadDetail(rid)]);
  }

  const accountName = isCombined
    ? t("out.acct.all")
    : accounts.find((a) => a.id === accountId)?.name ?? "";

  async function exportCsv() {
    setExportErr("");
    try {
      const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
      const lines = ["Code,Retailer,FOS,Opening,Transferred,Reversed,Cash,Outstanding"];
      for (const r of filtered) {
        lines.push(
          [
            esc(r.retailer_code ?? ""),
            esc(r.full_name),
            esc(r.fos_name ?? "—"),
            r.opening ?? 0,
            r.total_transferred,
            r.total_reversed,
            r.total_cash,
            r.outstanding,
          ].join(","),
        );
      }
      lines.push(
        `TOTAL,"","",${filtered.reduce((s, r) => s + (r.opening ?? 0), 0)},${filtered.reduce(
          (s, r) => s + r.total_transferred,
          0,
        )},${filtered.reduce((s, r) => s + r.total_reversed, 0)},${filtered.reduce(
          (s, r) => s + r.total_cash,
          0,
        )},${filteredTotal}`,
      );
      const csv = lines.join("\n");

      if (!(await Sharing.isAvailableAsync())) {
        setExportErr("Sharing is not available on this device");
        return;
      }
      const slug = isCombined
        ? "all"
        : accounts.find((a) => a.id === accountId)?.slug ?? accountId ?? "account";
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
        <Segmented
          options={[
            { value: COMBINED, label: t("out.acct.all") },
            ...accounts.map((a) => ({ value: a.id, label: a.name })),
          ]}
          value={accountId}
          onChange={setAccountId}
          locale={locale}
        />

        <View style={{ height: 13 }} />

        {pulse ? (
          <Card style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, marginBottom: 13 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <Calendar size={14} color={TH.accentInk} />
              <Text style={{ fontSize: 12.5, fontFamily: font(600, locale), color: TH.ink }}>
                {t("hist.range.today")} ·{" "}
                {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Mini l={t("out.col.transferred")} v={"+" + formatINR(pulse.transferred)} tone="pos" locale={locale} />
              <Mini l={t("out.col.cash")} v={"−" + formatINR(pulse.cash)} tone="neg" locale={locale} />
              <Mini l={t("today.net")} v={formatINR(pulse.transferred - pulse.reversed - pulse.cash)} locale={locale} />
            </View>
          </Card>
        ) : null}

        {personalTotal !== 0 ? (
          <Card style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, marginBottom: 13 }}>
            <View style={{ flexDirection: "row", gap: 22 }}>
              <View>
                <Text style={{ fontSize: 11.5, color: TH.ink3, fontFamily: font(500, locale) }}>
                  {t("out.receivable")}
                </Text>
                <Text style={{ fontSize: 15, color: TH.ink, fontFamily: font(700, "en", "num") }}>
                  {formatINR(collectibleTotal + defaultedTotal)}
                </Text>
              </View>
              <View>
                <Text style={{ fontSize: 11.5, color: TH.ink3, fontFamily: font(500, locale) }}>
                  {t("out.personal")}
                </Text>
                <Text style={{ fontSize: 15, color: TH.ink3, fontFamily: font(700, "en", "num") }}>
                  {formatINR(personalTotal)}
                </Text>
              </View>
            </View>
          </Card>
        ) : null}

        <Card style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 }}>
          <Segmented
            options={[
              { value: "today", label: t("hist.range.today") },
              { value: "1d", label: t("hist.range.yesterday") },
              { value: "7d", label: t("hist.range.7d") },
              { value: "30d", label: t("hist.range.30d") },
              { value: "full", label: t("hist.range.all") },
            ]}
            value={range === "custom" ? "" : range}
            onChange={setRange}
            locale={locale}
          />
          {showCustom || range === "custom" ? (
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <DateBtn label={t("hist.range.from")} value={fromInput} onPress={() => setPicker("from")} locale={locale} />
              <DateBtn label={t("hist.range.to")} value={toInput} onPress={() => setPicker("to")} locale={locale} />
            </View>
          ) : (
            <Pressable onPress={() => setShowCustom(true)} style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 12.5, color: TH.ink2, fontFamily: font(600, locale) }}>
                {t("hist.range.custom")}
              </Text>
            </Pressable>
          )}
          {picker ? (
            <DateTimePicker
              mode="date"
              value={
                ((picker === "from" ? fromInput : toInput) &&
                  new Date(`${picker === "from" ? fromInput : toInput}T00:00:00`)) ||
                new Date()
              }
              onChange={(e, d) => {
                setPicker(null);
                if (e.type !== "set" || !d) return;
                const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
                  d.getDate(),
                ).padStart(2, "0")}`;
                if (picker === "from") {
                  setFromInput(iso);
                  if (!toInput) setToInput(iso);
                } else {
                  setToInput(iso);
                  if (!fromInput) setFromInput(iso);
                }
                setRange("custom");
              }}
            />
          ) : null}
        </Card>

        <View style={{ height: 13 }} />

        {canManage && (defaulterCount > 0 || atRiskCount > 0) ? (
          <Card style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, marginBottom: 13 }}>
            <View style={{ flexDirection: "row", gap: 22, marginBottom: 10 }}>
              <View>
                <Text style={{ fontSize: 11.5, color: TH.ink3, fontFamily: font(500, locale) }}>
                  {t("def.split.collectible")}
                </Text>
                <Text style={{ fontSize: 15, color: TH.ink, fontFamily: font(700, "en", "num") }}>
                  {formatINR(collectibleTotal)}
                </Text>
              </View>
              <View>
                <Text style={{ fontSize: 11.5, color: TH.ink3, fontFamily: font(500, locale) }}>
                  {t("def.split.defaulted")}
                </Text>
                <Text style={{ fontSize: 15, color: TH.neg, fontFamily: font(700, "en", "num") }}>
                  {formatINR(defaultedTotal)}
                </Text>
              </View>
            </View>
            <Segmented
              options={[
                { value: "all", label: t("def.filter.all") },
                { value: "active", label: t("def.filter.active") },
                { value: "atrisk", label: fmt(t("def.filter.atrisk"), { n: atRiskCount }) },
                { value: "defaulters", label: fmt(t("def.filter.defaulters"), { n: defaulterCount }) },
              ]}
              value={statusFilter}
              onChange={setStatusFilter}
              locale={locale}
            />
          </Card>
        ) : null}

        {showSearch && rows.length > 0 ? (
          <Card
            style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, marginBottom: 13 }}
          >
            <Field
              label={t("out.filter.search")}
              value={query}
              onChangeText={setQuery}
              placeholder="Nakoda / M9825…"
              locale={locale}
            />
            <View style={{ height: 10 }} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Text
                style={{ flexShrink: 1, fontSize: 12.5, fontFamily: font(500, locale), color: TH.ink3 }}
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
            {(
              [
                { key: "active", label: t("def.filter.active"), color: TH.ink2, test: (r: Row) => !r.defaulted && !r.atRisk },
                { key: "atrisk", label: t("act.atrisk"), color: TH.warn, test: (r: Row) => !!r.atRisk && !r.defaulted },
                { key: "def", label: t("act.defaulters"), color: TH.ink3, test: (r: Row) => !!r.defaulted },
              ] as const
            ).map((g) => {
              const list = filtered.filter(g.test);
              if (!list.length) return null;
              const sub = list.reduce((s, r) => s + r.outstanding, 0);
              return (
                <View key={g.key}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginTop: 14, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: TH.border2 }}>
                    <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: g.color }} />
                    <Text style={{ fontSize: 11.5, color: g.color, fontFamily: font(700, locale), letterSpacing: 0.4 }}>
                      {g.label.toUpperCase()} · {list.length}
                    </Text>
                    <Text style={{ marginLeft: "auto", fontSize: 12.5, color: TH.ink3, fontFamily: font(400, "en", "num") }}>{formatINR(sub)}</Text>
                  </View>
                  {list.map((r) => (
                    <OutItem
                      key={r.id}
                      r={r}
                      open={expanded === r.id}
                      onToggle={() => toggle(r.id)}
                      daily={details[r.id] ?? []}
                      accountId={accountId}
                      accountName={accountName}
                      combined={isCombined}
                      canManage={canManage}
                      splits={r.splits ?? []}
                      onAdjusted={() => onAdjusted(r.id)}
                      onChanged={async () => {
                        setToast({ msg: t("def.changed") });
                        await load();
                      }}
                      locale={locale}
                    />
                  ))}
                </View>
              );
            })}
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
              <Text style={{ fontSize: 13.5, color: TH.ink, fontFamily: font(700, "en", "num") }}>
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
  combined,
  canManage,
  splits,
  onAdjusted,
  onChanged,
  locale,
}: {
  r: Row;
  open: boolean;
  onToggle: () => void;
  daily: DailyRow[];
  accountId: string;
  accountName: string;
  combined: boolean;
  canManage: boolean;
  splits: AccountSplit[];
  onAdjusted: () => void;
  onChanged: () => void;
  locale: Locale;
}) {
  const { t } = useT();
  const [adjusting, setAdjusting] = useState(false);
  const [markBusy, setMarkBusy] = useState(false);

  async function toggleDefaulter() {
    setMarkBusy(true);
    const ok = await setDefaulterApi(r.id, !r.defaulted);
    setMarkBusy(false);
    if (ok) onChanged();
  }

  // Combined view: one row per account (the split, incl. opening). Single view: daily history.
  const tableRows: DCell[][] = combined
    ? splits.map((sp) => [
        { text: sp.name },
        { text: kk(sp.opening) },
        sp.transferred
          ? { text: "+" + kk(sp.transferred), tone: "pos" as const }
          : { text: "—", tone: "mute" as const },
        sp.reversed
          ? { text: "−" + kk(sp.reversed), tone: "neg" as const }
          : { text: "—", tone: "mute" as const },
        sp.cash
          ? { text: "−" + kk(sp.cash), tone: "neg" as const }
          : { text: "—", tone: "mute" as const },
        { text: kk(sp.outstanding, true), tone: "close" as const },
      ])
    : daily.slice(0, 14).map((d) => [
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
        style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 14 }}
      >
        <View style={{ width: 22, alignItems: "flex-start" }}>
          <ChevronRight
            size={18}
            color={TH.ink3}
            style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
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
            {canManage && r.defaulted ? (
              <Badge tone="neg" locale={locale}>
                {t("def.badge.defaulter")}
              </Badge>
            ) : canManage && r.atRisk ? (
              <Badge tone="warn" locale={locale}>
                {t("def.badge.atrisk")}
              </Badge>
            ) : null}
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
            style={{ fontSize: 12, color: TH.ink2, marginTop: 2, fontFamily: font(500, locale) }}
          >
            {r.retailer_code ?? "—"} · {r.fos_name ?? t("users.fos_unassigned")}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontFamily: font(700, "en", "num"), fontSize: 17, color: TH.ink }}>
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
            <Mini l={t("history.col.open")} v={formatINR(r.opening ?? 0)} locale={locale} />
            <Mini l={t("out.col.transferred")} v={formatINR(r.total_transferred)} tone="pos" locale={locale} />
            <Mini l={t("out.col.cash")} v={formatINR(r.total_cash)} tone="neg" locale={locale} />
            <Mini l={t("out.col.outstanding")} v={formatINR(r.outstanding)} locale={locale} />
          </View>
          {canManage ? (
            <>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 12 }}>
                <Pressable
                  onPress={toggleDefaulter}
                  disabled={markBusy}
                  style={({ pressed }) => ({
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 999,
                    backgroundColor: TH.surface2,
                    borderWidth: 1,
                    borderColor: r.defaulted ? TH.border2 : TH.neg,
                    opacity: markBusy ? 0.5 : 1,
                    transform: pressed ? [{ scale: 0.95 }] : [],
                  })}
                >
                  <Text
                    style={{ fontSize: 13, fontFamily: font(700, locale), color: r.defaulted ? TH.ink : TH.neg }}
                    numberOfLines={1}
                  >
                    {markBusy ? "…" : r.defaulted ? t("def.clear") : t("def.mark")}
                  </Text>
                </Pressable>
              </View>
              {!combined ? (
                <>
                  <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 12 }}>
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
                      <Text style={{ fontSize: 13, fontFamily: font(700, locale), color: TH.ink }} numberOfLines={1}>
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
                </>
              ) : null}
            </>
          ) : null}
          <DTable
            headers={
              combined
                ? [
                    t("out.col.account"),
                    t("history.col.open"),
                    t("history.col.in"),
                    t("history.col.rev"),
                    t("history.col.cash"),
                    t("history.col.close"),
                  ]
                : [
                    t("history.col.date"),
                    t("history.col.open"),
                    t("history.col.in"),
                    t("history.col.rev"),
                    t("history.col.cash"),
                    t("history.col.close"),
                  ]
            }
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ retailer_id: r.id, account_id: accountId, target: Number(target), notes }),
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
        style={{ flex: 1, backgroundColor: "rgba(28,38,32,0.4)", justifyContent: "center", padding: 20 }}
        onPress={onClose}
      >
        <Pressable onPress={() => {}} style={{ backgroundColor: TH.surface, borderRadius: TH.rXl, padding: 22 }}>
          <Text style={{ fontSize: 17, fontFamily: font(800, locale), letterSpacing: -0.2, color: TH.ink }}>
            {t("out.adjust.title")}
          </Text>
          <Text style={{ fontSize: 12.5, color: TH.ink2, marginTop: 3, fontFamily: font(500, locale) }}>
            {r.full_name} · {accountName}
          </Text>
          <OutLine left={t("out.adjust.current")} right={formatINR(r.outstanding)} locale={locale} />
          <View style={{ height: 14 }} />
          {confirming ? (
            <>
              <Text style={{ fontSize: 14.5, lineHeight: 21, color: TH.ink2, fontFamily: font(500, locale), marginBottom: 4 }}>
                {fmt(t("out.adjust.confirm"), {
                  name: r.full_name,
                  account: accountName,
                  from: formatINR(r.outstanding),
                  to: formatINR(Number(target)),
                })}
              </Text>
              {err ? <InlineErr locale={locale}>{err}</InlineErr> : null}
              <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
                <Btn title={t("common.cancel")} variant="ghost" onPress={() => setConfirming(false)} locale={locale} />
                <Btn title={t("common.confirm")} onPress={submit} loading={busy} busyLabel="…" locale={locale} />
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
                <Btn title={t("common.cancel")} variant="ghost" onPress={onClose} locale={locale} />
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
    <View style={{ flex: 1, backgroundColor: TH.surface2, borderRadius: TH.rSm, padding: 10, minWidth: 0 }}>
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

function DateBtn({
  label,
  value,
  onPress,
  locale,
}: {
  label: string;
  value: string;
  onPress: () => void;
  locale: Locale;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text
        style={{
          fontSize: 12.5,
          color: TH.ink3,
          marginBottom: 4,
          fontFamily: font(500, locale),
        }}
      >
        {label}
      </Text>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 11,
          borderRadius: TH.rSm,
          borderWidth: 1,
          borderColor: TH.border2,
          backgroundColor: TH.surface,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Calendar size={15} color={TH.ink3} />
        <Text
          style={{
            fontSize: 14,
            color: value ? TH.ink : TH.ink3,
            fontFamily: font(value ? 600 : 500, locale),
          }}
        >
          {value || "—"}
        </Text>
      </Pressable>
    </View>
  );
}

function kk(n: string | number, oneDecimal = false) {
  const v = Number(n) / 1000;
  return oneDecimal ? v.toFixed(1) + "k" : Math.round(v).toString() + "k";
}
