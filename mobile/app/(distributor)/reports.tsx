import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Banknote, FileText, Upload, X } from "lucide-react-native";
import { LinenScreen } from "../../components/LinenScreen";
import { Topbar, SectionLabel, Btn } from "../../components/linen";
import {
  Card,
  Segmented,
  InlineErr,
  Empty,
  Divider,
  Field,
} from "../../components/linen/extras";
import {
  Subtabs,
  FilePick,
  ResultBox,
  DTable,
  type DCell,
  type PickedFile,
} from "../../components/linen/more";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { fetchAccounts } from "../../lib/accounts";
import { useRealtimeRefresh } from "../../lib/realtime";
import { useT, format as fmt, type Locale } from "../../lib/i18n";
import { formatDate, formatINR } from "../../lib/format";
import { T as TH, font } from "../../lib/theme";
import type { Account } from "../../lib/types";

/* ── Web upload API shapes ─────────────────────────────────── */
type EodSummary = {
  rows: number;
  transferred: number;
  reversed: number;
  new_retailers: { code: string; name: string | null; phone: string | null }[];
  affected_dates: string[];
  unmatched_transfers: number;
};
type CashSummary = {
  rows: number;
  total_amount: number;
  covered_dates: string[];
  per_account: Record<string, { rows: number; amount: number }>;
  sheets_processed: string[];
  missing_sheets: string[];
  warnings?: string[];
};

const XLSX_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];
const CSV_XLSX_TYPES = [...XLSX_TYPES, "text/csv", "text/comma-separated-values"];

async function uploadMultipart(
  path: string,
  files: PickedFile[],
  extra?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const base = process.env.EXPO_PUBLIC_API_URL;
  if (!base) throw new Error("EXPO_PUBLIC_API_URL is not set");
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  const fd = new FormData();
  for (const file of files) {
    fd.append("file", {
      uri: file.uri,
      name: file.name,
      type: file.mimeType ?? "application/octet-stream",
    } as unknown as Blob);
  }
  for (const [k, v] of Object.entries(extra ?? {})) fd.append(k, v);
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  return (await res.json()) as Record<string, unknown>;
}

/* Date filters default to today (IST); the user can change or clear them. */
const todayIst = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

function dateRange(dates: string[]): string {
  if (!dates.length) return "—";
  const dd = (s: string) => {
    const d = new Date(s);
    return Number.isNaN(d.getTime())
      ? s
      : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  };
  return dates.length === 1 ? dd(dates[0]) : `${dd(dates[0])} – ${dd(dates[dates.length - 1])}`;
}

function FileChips({
  files,
  onFiles,
}: {
  files: PickedFile[];
  onFiles: (f: PickedFile[]) => void;
}) {
  if (!files.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
      {files.map((f, i) => (
        <View
          key={`${f.uri}-${i}`}
          style={{
            borderRadius: 999,
            paddingVertical: 5,
            paddingHorizontal: 9,
            backgroundColor: TH.surface2,
            borderWidth: 1,
            borderColor: TH.border2,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              fontSize: 12,
              fontFamily: font(600, "en"),
              color: TH.ink2,
              maxWidth: 180,
            }}
          >
            {f.name}
          </Text>
          <Pressable hitSlop={8} onPress={() => onFiles(files.filter((_, j) => j !== i))}>
            <X size={13} color={TH.ink3} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

/* ── Screen ────────────────────────────────────────────────── */
export default function Reports() {
  const { profile } = useAuth();
  const { t, locale } = useT();
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"eod" | "cash">("eod");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    if (!profile) return;
    setAccounts(await fetchAccounts(profile.id));
    setRefreshKey((k) => k + 1);
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  if (!profile) return null;

  return (
    <LinenScreen
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
      topbar={<Topbar title={t("reports.title")} locale={locale} />}
    >
      <Subtabs
        options={[
          { value: "eod", label: t("reports.eod_tab") },
          { value: "cash", label: t("reports.cash_tab") },
        ]}
        value={tab}
        onChange={setTab}
        locale={locale}
      />
      {tab === "eod" ? (
        <EodUpload accounts={accounts} locale={locale} refreshKey={refreshKey} />
      ) : (
        <CashReport accounts={accounts} locale={locale} />
      )}
    </LinenScreen>
  );
}

/* ── EOD upload tab ────────────────────────────────────────── */
function EodUpload({
  accounts,
  locale,
  refreshKey,
}: {
  accounts: Account[];
  locale: Locale;
  refreshKey: number;
}) {
  const { t } = useT();
  const [accountId, setAccountId] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [driveLinks, setDriveLinks] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<EodSummary | null>(null);

  const effAccountId = accountId || (accounts[0]?.id ?? "");

  async function importSheet() {
    setErr("");
    if (!accountId) {
      setErr(t("reports.err.account"));
      return;
    }
    if (!files.length && !driveLinks.trim()) {
      setErr(t("reports.err.file"));
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const json = await uploadMultipart("/api/uploads/eod", files, {
        ...(driveLinks.trim() ? { drive_links: driveLinks } : {}),
        account_id: accountId,
      });
      if (json.ok) {
        setResult(json.summary as EodSummary);
      } else if (Array.isArray(json.errors)) {
        const list = json.errors as { row?: number; message: string }[];
        setErr(
          list
            .slice(0, 4)
            .map((e) => (e.row ? `Row ${e.row}: ${e.message}` : e.message))
            .join("\n"),
        );
      } else {
        setErr(String(json.error ?? "Upload failed"));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      <Text
        style={{
          fontSize: 13.5,
          fontFamily: font(600, locale),
          color: TH.ink2,
          marginBottom: 7,
          marginLeft: 3,
        }}
      >
        {t("eod.account")}
      </Text>
      <Segmented
        options={accounts.map((a) => ({ value: a.id, label: a.name }))}
        value={effAccountId}
        onChange={setAccountId}
        locale={locale}
      />
      <View style={{ height: 13 }} />

      <SectionLabel locale={locale} style={{ marginTop: 6 }}>
        {t("eod.upload_pemo")}
      </SectionLabel>
      <FilePick
        files={files}
        onFiles={setFiles}
        label={t("reports.choose_pemo")}
        acceptLabel="CSV or XLSX"
        replaceLabel={t("reports.tap_replace")}
        types={CSV_XLSX_TYPES}
        locale={locale}
      />
      <FileChips files={files} onFiles={setFiles} />
      <View style={{ height: 13 }} />
      <Field
        label={t("reports.drive")}
        value={driveLinks}
        onChangeText={setDriveLinks}
        placeholder={t("reports.drive.ph")}
        hint={t("reports.drive.hint")}
        multiline
        locale={locale}
      />
      {err ? <InlineErr locale={locale}>{err}</InlineErr> : null}
      <View style={{ height: 13 }} />
      <Btn
        title={t("eod.import")}
        busyLabel={t("eod.importing")}
        icon={<Upload size={18} color={TH.onAccent} />}
        onPress={importSheet}
        loading={busy}
        locale={locale}
      />

      {result ? (
        <>
          <ResultBox
            title={fmt(t("reports.imported_rows"), { n: result.rows })}
            lines={[
              { l: t("reports.transferred_total"), v: formatINR(result.transferred) },
              { l: t("reports.reversed_total"), v: formatINR(result.reversed) },
              { l: t("reports.affected_dates"), v: dateRange(result.affected_dates) },
              { l: t("reports.auto_created"), v: String(result.new_retailers.length) },
              ...result.new_retailers.map((r) => ({
                l: r.code,
                v: r.phone ?? r.name ?? "—",
              })),
            ]}
            locale={locale}
          />
          {result.unmatched_transfers > 0 ? (
            <ResultBox
              err
              title={fmt(t("reports.unmatched"), { n: result.unmatched_transfers })}
              note={t("reports.unmatched_sub")}
              locale={locale}
            />
          ) : null}
        </>
      ) : null}

      <SectionLabel locale={locale}>{t("eod.fmt.title")}</SectionLabel>
      <Card>
        <Text
          style={{
            fontSize: 14,
            fontFamily: font(700, locale),
            color: TH.ink,
            marginBottom: 6,
          }}
        >
          {t("reports.fmt1")}
        </Text>
        <FmtList locale={locale}>
          {t("reports.fmt1_cols")} <Code>RequestId</Code>, <Code>Merchant MobileNo</Code>,{" "}
          <Code>Merchant</Code>, <Code>Amount</Code> (signed), <Code>Narration</Code>,{" "}
          <Code>Transfer Date</Code>
        </FmtList>
        <Divider />
        <Text
          style={{
            fontSize: 14,
            fontFamily: font(700, locale),
            color: TH.ink,
            marginBottom: 6,
          }}
        >
          {t("reports.fmt2")}
        </Text>
        <FmtList locale={locale}>
          <Code>retailer_code</Code>, <Code>retailer_name?</Code>,{" "}
          <Code>retailer_phone?</Code>, <Code>type</Code>, <Code>amount</Code>,{" "}
          <Code>txn_date?</Code>, <Code>bank_reference?</Code>, <Code>notes?</Code>
        </FmtList>
        <View
          style={{
            marginTop: 8,
            backgroundColor: TH.surface2,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 8,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontFamily: font(500, "en", "num"),
              color: TH.ink2,
            }}
          >
            RT-2041,Ramesh,+91…,transfer,12000,2026-06-08,UTR8841920,
          </Text>
        </View>
        <FmtList locale={locale} style={{ marginTop: 10 }}>
          {t("reports.atomic_note")}
        </FmtList>
      </Card>

      <EodTxns
        accountId={effAccountId}
        accountSlug={accounts.find((a) => a.id === effAccountId)?.slug ?? "account"}
        refreshKey={refreshKey}
        locale={locale}
      />

      <EodRecon
        accountId={effAccountId}
        accountSlug={accounts.find((a) => a.id === effAccountId)?.slug ?? "account"}
        refreshKey={refreshKey}
        locale={locale}
      />
    </View>
  );
}

/* ── EOD transactions ledger (mirrors web EodTxnsTable) ────── */
type EodTxnRow = {
  id: string;
  type: "transfer" | "reversal";
  amount: string | number;
  txn_date: string;
  bank_reference: string | null;
  retailer: { full_name: string; retailer_code: string | null } | null;
};

function EodTxns({
  accountId,
  accountSlug,
  refreshKey,
  locale,
}: {
  accountId: string;
  accountSlug: string;
  refreshKey: number;
  locale: Locale;
}) {
  const { t } = useT();
  const { profile } = useAuth();
  const [txns, setTxns] = useState<EodTxnRow[]>([]);
  const [fFrom, setFFrom] = useState(todayIst());
  const [fTo, setFTo] = useState(todayIst());
  const [fQuery, setFQuery] = useState("");
  const [fType, setFType] = useState<"all" | "transfer" | "reversal">("all");
  const [exportErr, setExportErr] = useState("");

  const load = useCallback(async () => {
    if (!profile || !accountId) return;
    const { data } = await supabase
      .from("eod_transactions")
      .select(
        "id, type, amount, txn_date, bank_reference, retailer:retailer_id(full_name, retailer_code)",
      )
      .eq("distributor_id", profile.id)
      .eq("account_id", accountId)
      .order("txn_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300);
    setTxns((data ?? []) as unknown as EodTxnRow[]);
  }, [profile, accountId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useRealtimeRefresh(
    profile?.id
      ? [{ table: "eod_transactions", filter: `distributor_id=eq.${profile.id}` }]
      : [],
    load,
  );

  const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const filtered = txns.filter((x) => {
    if (isYmd(fFrom) && x.txn_date < fFrom) return false;
    if (isYmd(fTo) && x.txn_date > fTo) return false;
    if (fType !== "all" && x.type !== fType) return false;
    if (fQuery) {
      const q = fQuery.trim().toLowerCase();
      if (
        q &&
        !(x.retailer?.full_name ?? "").toLowerCase().includes(q) &&
        !(x.retailer?.retailer_code ?? "").toLowerCase().includes(q) &&
        !(x.bank_reference ?? "").toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const transferred = filtered
    .filter((x) => x.type === "transfer")
    .reduce((s, x) => s + Number(x.amount), 0);
  const reversed = filtered
    .filter((x) => x.type === "reversal")
    .reduce((s, x) => s + Number(x.amount), 0);

  const k1 = (n: number) => (n / 1000).toFixed(1) + "k";
  const dd = (s: string) => {
    const d = new Date(s);
    return Number.isNaN(d.getTime())
      ? s
      : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  };

  async function exportCsv() {
    setExportErr("");
    try {
      const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
      const lines = ["Date,Retailer,Code,Type,Amount,Reference"];
      for (const x of filtered) {
        lines.push(
          [
            x.txn_date,
            esc(x.retailer?.full_name ?? ""),
            esc(x.retailer?.retailer_code ?? ""),
            x.type,
            Number(x.amount),
            esc(x.bank_reference ?? ""),
          ].join(","),
        );
      }
      lines.push(
        `TOTAL,${esc(
          `${t("eod.type.transfer")} ${transferred} / ${t("eod.type.reversal")} ${reversed}`,
        )},"",net,${transferred - reversed},""`,
      );
      const csv = lines.join("\n");

      if (!(await Sharing.isAvailableAsync())) {
        setExportErr("Sharing is not available on this device");
        return;
      }
      const file = new File(
        Paths.cache,
        `eod-${accountSlug}-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      file.create({ overwrite: true, intermediates: true });
      file.write(csv);
      await Sharing.shareAsync(file.uri, { mimeType: "text/csv" });
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : String(e));
    }
  }

  const tableRows: DCell[][] = filtered.slice(0, 200).map((x) => [
    { text: dd(x.txn_date) },
    {
      text: x.retailer?.full_name ?? x.retailer?.retailer_code ?? "?",
      ui: true,
    },
    x.type === "transfer"
      ? { text: t("eod.type.transfer"), tone: "pos" as const, ui: true }
      : { text: t("eod.type.reversal"), tone: "diff" as const, ui: true },
    x.type === "reversal"
      ? { text: "−" + k1(Number(x.amount)), tone: "diff" as const }
      : { text: k1(Number(x.amount)) },
  ]);

  return (
    <View>
      <SectionLabel locale={locale}>{t("eod.txns")}</SectionLabel>
      <FmtList locale={locale} style={{ marginBottom: 12 }}>
        {t("eod.txns_note")}
      </FmtList>
      {txns.length ? (
        <Card
          style={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 12,
            marginBottom: 13,
          }}
        >
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field
                label={t("reports.filter.from")}
                value={fFrom}
                onChangeText={setFFrom}
                placeholder="YYYY-MM-DD"
                locale={locale}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label={t("reports.filter.to")}
                value={fTo}
                onChangeText={setFTo}
                placeholder="YYYY-MM-DD"
                locale={locale}
              />
            </View>
          </View>
          <Field
            label={t("reports.filter.search")}
            value={fQuery}
            onChangeText={setFQuery}
            placeholder="Nakoda / UTR…"
            locale={locale}
          />
          <Segmented
            options={[
              { value: "all", label: t("eod.type.all") },
              { value: "transfer", label: t("eod.type.transfer") },
              { value: "reversal", label: t("eod.type.reversal") },
            ]}
            value={fType}
            onChange={(v) => setFType(v as typeof fType)}
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
              {fmt(t("reports.filtered_rows"), { n: filtered.length, total: txns.length })}
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
                {t("reports.export")}
              </Text>
            </Pressable>
          </View>
          {exportErr ? <InlineErr locale={locale}>{exportErr}</InlineErr> : null}
        </Card>
      ) : null}
      {filtered.length ? (
        <Card style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
          <DTable
            headers={[
              t("cashreport.col.date"),
              t("cashreport.col.retailer"),
              t("eod.col.type"),
              "₹",
            ]}
            rows={tableRows}
            footer={[
              { text: fmt(t("reports.rows"), { n: filtered.length }) },
              { text: "+" + k1(transferred), tone: "pos" as const },
              { text: "−" + k1(reversed), tone: "neg" as const },
              { text: t("eod.net") + " " + k1(transferred - reversed) },
            ]}
            locale={locale}
          />
        </Card>
      ) : (
        <Empty
          icon={<FileText size={26} color={TH.ink3} />}
          title={t("reports.empty")}
          locale={locale}
        />
      )}
    </View>
  );
}

/* ── File vs app — transfers (mirrors web EodReconTable) ───── */
type EodReconItem = {
  date: string;
  retailer_id: string;
  code: string;
  name: string;
  file: number;
  app: number;
};

function EodRecon({
  accountId,
  accountSlug,
  refreshKey,
  locale,
}: {
  accountId: string;
  accountSlug: string;
  refreshKey: number;
  locale: Locale;
}) {
  const { t } = useT();
  const { profile } = useAuth();
  const [rows, setRows] = useState<EodReconItem[]>([]);
  const [fFrom, setFFrom] = useState(todayIst());
  const [fTo, setFTo] = useState(todayIst());
  const [fQuery, setFQuery] = useState("");
  const [fOnlyDiff, setFOnlyDiff] = useState(false);
  const [exportErr, setExportErr] = useState("");

  const load = useCallback(async () => {
    if (!profile || !accountId) return;
    const [txns, reqs, profiles] = await Promise.all([
      supabase
        .from("eod_transactions")
        .select("retailer_id, amount, txn_date")
        .eq("distributor_id", profile.id)
        .eq("account_id", accountId)
        .eq("type", "transfer"),
      supabase
        .from("money_requests")
        .select("retailer_id, requested_amount, fos_amount, final_amount, distributor_acted_at")
        .eq("distributor_id", profile.id)
        .eq("account_id", accountId)
        .eq("distributor_status", "approved"),
      supabase
        .from("profiles")
        .select("id, full_name, retailer_code")
        .eq("distributor_id", profile.id)
        .eq("role", "retailer"),
    ]);
    const byId = new Map((profiles.data ?? []).map((p) => [p.id, p]));
    const ist = (iso: string) =>
      new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

    const map = new Map<string, EodReconItem>();
    const get = (rid: string, date: string) => {
      const k = `${rid}|${date}`;
      let row = map.get(k);
      if (!row) {
        const prof = byId.get(rid);
        row = {
          date,
          retailer_id: rid,
          code: prof?.retailer_code ?? "",
          name: prof?.full_name ?? "?",
          file: 0,
          app: 0,
        };
        map.set(k, row);
      }
      return row;
    };
    for (const x of txns.data ?? []) get(x.retailer_id, x.txn_date).file += Number(x.amount);
    for (const r of reqs.data ?? []) {
      if (!r.distributor_acted_at) continue;
      get(r.retailer_id, ist(r.distributor_acted_at)).app += Number(
        r.final_amount ?? r.fos_amount ?? r.requested_amount,
      );
    }
    setRows(
      [...map.values()].sort(
        (a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name),
      ),
    );
  }, [profile, accountId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useRealtimeRefresh(
    profile?.id
      ? [
          { table: "eod_transactions", filter: `distributor_id=eq.${profile.id}` },
          { table: "money_requests", filter: `distributor_id=eq.${profile.id}` },
        ]
      : [],
    load,
  );

  const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const filtered = rows.filter((r) => {
    if (isYmd(fFrom) && r.date < fFrom) return false;
    if (isYmd(fTo) && r.date > fTo) return false;
    if (fOnlyDiff && Math.abs(r.file - r.app) < 0.01) return false;
    if (fQuery) {
      const q = fQuery.trim().toLowerCase();
      if (q && !r.name.toLowerCase().includes(q) && !r.code.toLowerCase().includes(q))
        return false;
    }
    return true;
  });
  const mismatches = filtered.filter((r) => Math.abs(r.file - r.app) >= 0.01).length;

  const fileTotal = filtered.reduce((s, r) => s + r.file, 0);
  const appTotal = filtered.reduce((s, r) => s + r.app, 0);
  const diffTotal = fileTotal - appTotal;

  const k1 = (n: number) => (n / 1000).toFixed(1) + "k";
  const dd = (s: string) => {
    const d = new Date(s);
    return Number.isNaN(d.getTime())
      ? s
      : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  };

  async function exportCsv() {
    setExportErr("");
    try {
      const r2 = (n: number) => Math.round(n * 100) / 100;
      const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
      const lines = ["Date,Retailer,Code,File,App,Diff"];
      for (const r of filtered) {
        lines.push(
          `${r.date},${esc(r.name)},${esc(r.code)},${r.file},${r.app},${r2(r.file - r.app)}`,
        );
      }
      lines.push(`TOTAL,"","",${fileTotal},${appTotal},${r2(diffTotal)}`);
      const csv = lines.join("\n");

      if (!(await Sharing.isAvailableAsync())) {
        setExportErr("Sharing is not available on this device");
        return;
      }
      const file = new File(
        Paths.cache,
        `eod-vs-app-${accountSlug}-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      file.create({ overwrite: true, intermediates: true });
      file.write(csv);
      await Sharing.shareAsync(file.uri, { mimeType: "text/csv" });
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : String(e));
    }
  }

  const tableRows: DCell[][] = filtered.slice(0, 200).map((r) => {
    const diff = r.file - r.app;
    return [
      { text: dd(r.date) },
      { text: r.name, ui: true },
      { text: k1(r.file) },
      { text: k1(r.app) },
      Math.abs(diff) < 0.01
        ? { text: "—", tone: "mute" as const }
        : {
            text: (diff > 0 ? "+" : "−") + Math.abs(diff / 1000).toFixed(1) + "k",
            tone: "diff" as const,
          },
    ];
  });

  return (
    <View>
      <SectionLabel locale={locale}>{t("eod.recon")}</SectionLabel>
      <Text
        style={{
          fontSize: 12.5,
          color: TH.ink2,
          lineHeight: 19,
          fontFamily: font(500, locale),
          marginBottom: 12,
        }}
      >
        {t("eod.recon_note")}
      </Text>
      {rows.length ? (
        <Card
          style={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 12,
            marginBottom: 13,
          }}
        >
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field
                label={t("reports.filter.from")}
                value={fFrom}
                onChangeText={setFFrom}
                placeholder="YYYY-MM-DD"
                locale={locale}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label={t("reports.filter.to")}
                value={fTo}
                onChangeText={setFTo}
                placeholder="YYYY-MM-DD"
                locale={locale}
              />
            </View>
          </View>
          <Field
            label={t("reports.filter.search")}
            value={fQuery}
            onChangeText={setFQuery}
            placeholder="Nakoda / M9825…"
            locale={locale}
          />
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}
          >
            <Pressable
              onPress={() => setFOnlyDiff(!fOnlyDiff)}
              style={{
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 6,
                backgroundColor: fOnlyDiff ? TH.accent : TH.surface2,
                borderWidth: 1,
                borderColor: fOnlyDiff ? "transparent" : TH.border,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: font(700, locale),
                  color: fOnlyDiff ? TH.onAccent : TH.ink2,
                }}
              >
                {t("reports.filter.only_diff")}
              </Text>
            </Pressable>
            <Text
              style={{
                flexShrink: 1,
                fontSize: 12.5,
                fontFamily: font(500, locale),
                color: TH.ink3,
              }}
            >
              {fmt(t("reports.filtered_rows"), { n: filtered.length, total: rows.length })}
              {mismatches > 0 ? (
                <Text style={{ color: TH.warn, fontFamily: font(700, locale) }}>
                  {" · "}
                  {fmt(t("reports.mismatch_count"), { n: mismatches })}
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
                {t("reports.export")}
              </Text>
            </Pressable>
          </View>
          {exportErr ? <InlineErr locale={locale}>{exportErr}</InlineErr> : null}
        </Card>
      ) : null}
      {filtered.length ? (
        <Card style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
          <DTable
            headers={[
              t("cashreport.col.date"),
              t("cashreport.col.retailer"),
              t("reports.col.file"),
              t("reports.col.app"),
              t("cashreport.col.diff"),
            ]}
            rows={tableRows}
            footer={[
              { text: fmt(t("reports.rows"), { n: filtered.length }) },
              { text: "" },
              { text: k1(fileTotal) },
              { text: k1(appTotal) },
              {
                text: (diffTotal / 1000).toFixed(1) + "k",
                tone: Math.abs(diffTotal) < 0.01 ? ("mute" as const) : ("diff" as const),
              },
            ]}
            locale={locale}
          />
        </Card>
      ) : (
        <Empty
          icon={<FileText size={26} color={TH.ink3} />}
          title={t("reports.empty")}
          locale={locale}
        />
      )}
    </View>
  );
}

/* ── Cash report tab ───────────────────────────────────────── */
type ReconRow = { date: string; code: string; book: number; system: number };

function CashReport({ accounts, locale }: { accounts: Account[]; locale: Locale }) {
  const { t } = useT();
  const { profile } = useAuth();
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [driveLinks, setDriveLinks] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<CashSummary | null>(null);
  const [reconAcct, setReconAcct] = useState("");
  const [recon, setRecon] = useState<ReconRow[]>([]);
  const [fFrom, setFFrom] = useState(todayIst());
  const [fTo, setFTo] = useState(todayIst());
  const [fQuery, setFQuery] = useState("");
  const [fOnlyDiff, setFOnlyDiff] = useState(false);
  const [exportErr, setExportErr] = useState("");

  const accountId = reconAcct || (accounts[0]?.id ?? "");

  const loadRecon = useCallback(async () => {
    if (!profile || !accountId) return;
    const [entries, subs] = await Promise.all([
      supabase
        .from("cash_report_entries")
        .select("retailer_id, txn_date, amount")
        .eq("account_id", accountId),
      supabase
        .from("cash_submissions")
        .select("retailer_id, txn_date, amount, approved_amount")
        .eq("account_id", accountId)
        .eq("distributor_id", profile.id)
        .eq("status", "approved"),
    ]);
    const map = new Map<string, { retailer_id: string; date: string; book: number; system: number }>();
    const bump = (retailerId: string, date: string, key: "book" | "system", amt: number) => {
      const k = `${retailerId}|${date}`;
      const cur = map.get(k) ?? { retailer_id: retailerId, date, book: 0, system: 0 };
      cur[key] += amt;
      map.set(k, cur);
    };
    for (const e of entries.data ?? []) bump(e.retailer_id, e.txn_date, "book", Number(e.amount));
    for (const s of subs.data ?? [])
      bump(s.retailer_id, s.txn_date, "system", Number(s.approved_amount ?? s.amount));

    const ids = Array.from(new Set(Array.from(map.values()).map((v) => v.retailer_id)));
    const codeOf = new Map<string, string>();
    if (ids.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, retailer_code, full_name")
        .in("id", ids);
      for (const p of profiles ?? []) codeOf.set(p.id, p.retailer_code ?? p.full_name);
    }
    const rows = Array.from(map.values())
      .sort((a, b) => (a.date === b.date ? a.retailer_id.localeCompare(b.retailer_id) : a.date < b.date ? 1 : -1))
      .map((v) => ({
        date: v.date,
        code: codeOf.get(v.retailer_id) ?? "?",
        book: v.book,
        system: v.system,
      }));
    setRecon(rows);
  }, [profile, accountId]);

  useEffect(() => {
    loadRecon();
  }, [loadRecon]);

  useRealtimeRefresh(
    profile?.id
      ? [
          { table: "cash_report_entries" },
          { table: "cash_submissions", filter: `distributor_id=eq.${profile.id}` },
        ]
      : [],
    loadRecon,
  );

  async function importBook() {
    setErr("");
    if (!files.length && !driveLinks.trim()) {
      setErr(t("reports.err.xlsx"));
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const json = await uploadMultipart("/api/uploads/cash-report", files, driveLinks.trim() ? { drive_links: driveLinks } : undefined);
      if (json.ok) {
        setResult(json.summary as CashSummary);
        loadRecon();
      } else {
        setErr(String(json.error ?? "Upload failed"));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const accountName = (slug: string) =>
    accounts.find((a) => a.slug === slug)?.name ?? slug;

  const k1 = (n: number) => (n / 1000).toFixed(1) + "k";
  const dd = (s: string) => {
    const d = new Date(s);
    return Number.isNaN(d.getTime())
      ? s
      : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  };

  const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const filtered = recon.filter((r) => {
    if (isYmd(fFrom) && r.date < fFrom) return false;
    if (isYmd(fTo) && r.date > fTo) return false;
    if (fOnlyDiff && Math.abs(r.book - r.system) < 0.01) return false;
    if (fQuery) {
      const q = fQuery.trim().toLowerCase();
      if (q && !r.code.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const mismatches = filtered.filter((r) => Math.abs(r.book - r.system) >= 0.01).length;

  const bookTotal = filtered.reduce((s, r) => s + r.book, 0);
  const sysTotal = filtered.reduce((s, r) => s + r.system, 0);
  const diffTotal = bookTotal - sysTotal;

  async function exportCsv() {
    setExportErr("");
    try {
      const r2 = (n: number) => Math.round(n * 100) / 100;
      const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
      const lines = ["Date,Retailer,Book,System,Diff"];
      for (const r of filtered) {
        lines.push(`${r.date},${esc(r.code)},${r.book},${r.system},${r2(r.book - r.system)}`);
      }
      lines.push(`TOTAL,"",${bookTotal},${sysTotal},${r2(diffTotal)}`);
      const csv = lines.join("\n");

      if (!(await Sharing.isAvailableAsync())) {
        setExportErr("Sharing is not available on this device");
        return;
      }
      const slug = accounts.find((a) => a.id === accountId)?.slug ?? "recon";
      const file = new File(
        Paths.cache,
        `reconciliation-${slug}-${new Date().toISOString().slice(0, 10)}.csv`,
      );
      file.create({ overwrite: true, intermediates: true });
      file.write(csv);
      await Sharing.shareAsync(file.uri, { mimeType: "text/csv" });
    } catch (e) {
      setExportErr(e instanceof Error ? e.message : String(e));
    }
  }

  const tableRows: DCell[][] = filtered.map((r) => {
    const diff = r.book - r.system;
    return [
      { text: dd(r.date) },
      { text: r.code, ui: true },
      { text: k1(r.book) },
      { text: k1(r.system) },
      diff === 0
        ? { text: "—", tone: "mute" as const }
        : { text: (diff > 0 ? "+" : "−") + Math.abs(diff / 1000).toFixed(1) + "k", tone: "diff" as const },
    ];
  });

  return (
    <View>
      <SectionLabel locale={locale} style={{ marginTop: 6 }}>
        {t("cashreport.upload")}
      </SectionLabel>
      <FmtList locale={locale} style={{ marginBottom: 13 }}>
        {t("cashreport.help")}
      </FmtList>
      <FilePick
        files={files}
        onFiles={setFiles}
        label={t("reports.choose_book")}
        acceptLabel="XLSX"
        replaceLabel={t("reports.tap_replace")}
        types={XLSX_TYPES}
        locale={locale}
      />
      <FileChips files={files} onFiles={setFiles} />
      <View style={{ height: 13 }} />
      <Field
        label={t("reports.drive")}
        value={driveLinks}
        onChangeText={setDriveLinks}
        placeholder={t("reports.drive.ph")}
        hint={t("reports.drive.hint")}
        multiline
        locale={locale}
      />
      {err ? <InlineErr locale={locale}>{err}</InlineErr> : null}
      <View style={{ height: 13 }} />
      <Btn
        title={t("cashreport.import")}
        busyLabel={t("eod.importing")}
        icon={<Upload size={18} color={TH.onAccent} />}
        onPress={importBook}
        loading={busy}
        locale={locale}
      />

      {result ? (
        <ResultBox
          title={fmt(t("reports.imported_entries"), { n: result.rows })}
          lines={[
            { l: t("reports.total_cash"), v: formatINR(result.total_amount) },
            { l: t("reports.sheets"), v: result.sheets_processed.join(", ") || "—" },
            ...Object.entries(result.per_account).map(([slug, pa]) => ({
              l: accountName(slug),
              v: `${fmt(t("reports.rows"), { n: pa.rows })} · ${formatINR(pa.amount)}`,
            })),
            { l: t("reports.covered_dates"), v: dateRange(result.covered_dates) },
          ]}
          locale={locale}
        />
      ) : null}
      {result
        ? (result.warnings ?? []).map((w, i) => (
            <InlineErr key={"w" + i} locale={locale}>
              {w}
            </InlineErr>
          ))
        : null}
      {result &&
      !result.covered_dates.includes(
        new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
      ) ? (
        <InlineErr locale={locale}>
          {fmt(t("reports.no_today_col"), {
            date: formatDate(
              new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
            ),
          })}
        </InlineErr>
      ) : null}

      <SectionLabel locale={locale}>{t("cashreport.recon")}</SectionLabel>
      <FmtList locale={locale} style={{ marginBottom: 12 }}>
        {t("cashreport.recon.help")}
      </FmtList>
      <Segmented
        options={accounts.map((a) => ({ value: a.id, label: a.name }))}
        value={accountId}
        onChange={setReconAcct}
        locale={locale}
      />
      <View style={{ height: 13 }} />
      {recon.length ? (
        <Card style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, marginBottom: 13 }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field
                label={t("reports.filter.from")}
                value={fFrom}
                onChangeText={setFFrom}
                placeholder="YYYY-MM-DD"
                locale={locale}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label={t("reports.filter.to")}
                value={fTo}
                onChangeText={setFTo}
                placeholder="YYYY-MM-DD"
                locale={locale}
              />
            </View>
          </View>
          <Field
            label={t("reports.filter.search")}
            value={fQuery}
            onChangeText={setFQuery}
            placeholder="Nakoda / M9825…"
            locale={locale}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Pressable
              onPress={() => setFOnlyDiff(!fOnlyDiff)}
              style={{
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 6,
                backgroundColor: fOnlyDiff ? TH.accent : TH.surface2,
                borderWidth: 1,
                borderColor: fOnlyDiff ? "transparent" : TH.border,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: font(700, locale),
                  color: fOnlyDiff ? TH.onAccent : TH.ink2,
                }}
              >
                {t("reports.filter.only_diff")}
              </Text>
            </Pressable>
            <Text
              style={{
                flexShrink: 1,
                fontSize: 12.5,
                fontFamily: font(500, locale),
                color: TH.ink3,
              }}
            >
              {fmt(t("reports.filtered_rows"), { n: filtered.length, total: recon.length })}
              {mismatches > 0 ? (
                <Text style={{ color: TH.warn, fontFamily: font(700, locale) }}>
                  {" · "}
                  {fmt(t("reports.mismatch_count"), { n: mismatches })}
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
                {t("reports.export")}
              </Text>
            </Pressable>
          </View>
          {exportErr ? <InlineErr locale={locale}>{exportErr}</InlineErr> : null}
        </Card>
      ) : null}
      {filtered.length ? (
        <Card style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
          <DTable
            headers={[
              t("cashreport.col.date"),
              t("cashreport.col.retailer"),
              t("cashreport.col.book"),
              t("cashreport.col.sys"),
              t("cashreport.col.diff"),
            ]}
            rows={tableRows}
            footer={[
              { text: fmt(t("reports.rows"), { n: filtered.length }) },
              { text: "" },
              { text: k1(bookTotal) },
              { text: k1(sysTotal) },
              {
                text: (diffTotal / 1000).toFixed(1) + "k",
                tone: diffTotal === 0 ? ("mute" as const) : ("diff" as const),
              },
            ]}
            locale={locale}
          />
        </Card>
      ) : (
        <Empty
          icon={<Banknote size={26} color={TH.ink3} />}
          title={fmt(t("cashreport.empty"), {
            account: accounts.find((a) => a.id === accountId)?.name ?? "",
          })}
          locale={locale}
        />
      )}
    </View>
  );
}

/* ── small text helpers (design .fmt-list / code) ──────────── */
function FmtList({
  children,
  locale,
  style,
}: {
  children: React.ReactNode;
  locale: Locale;
  style?: object;
}) {
  return (
    <Text
      style={[
        {
          fontSize: 12.5,
          color: TH.ink2,
          lineHeight: 21,
          fontFamily: font(500, locale),
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontFamily: font(500, "en", "num"),
        fontSize: 12,
        color: TH.ink,
        backgroundColor: TH.surface2,
      }}
    >
      {children}
    </Text>
  );
}
