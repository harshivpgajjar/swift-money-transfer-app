"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadEod } from "@/lib/actions/eod";
import type { EodResult } from "@/lib/uploads/eod-core";
import { uploadCashReport } from "@/lib/actions/cash-report";
import type { CashReportResult } from "@/lib/uploads/cash-report-core";
import { useT, fmt } from "@/lib/i18n";
import DrivePickerBtn from "@/components/drive-picker";
import { formatShortDate, kShort } from "@/lib/format";
import { formatINR } from "@/lib/utils";
import {
  Btn,
  Empty,
  Field,
  FileDrop,
  Icon,
  InlineErr,
  SectionLabel,
  Segmented,
} from "@/lib/ui";

type AccountOpt = { id: string; slug: string; name: string };
type ReconRow = { date: string; code: string; name: string; book: number; system: number };

/* Date filters default to today (IST); the user can change or clear them. */
const todayIst = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

function EodUpload({ accounts }: { accounts: AccountOpt[] }) {
  const { t } = useT();
  const router = useRouter();
  const [account, setAccount] = useState(accounts[0]?.id ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [driveLinks, setDriveLinks] = useState("");
  const [reportPortal, setReportPortal] = useState<"HT" | "PT">("PT");
  const [err, setErr] = useState("");
  const [result, setResult] = useState<EodResult | null>(null);
  const [busy, start] = useTransition();
  const accSlug = accounts.find((a) => a.id === account)?.slug;

  const importSheet = () => {
    setErr("");
    if (!account) {
      setErr(t("reports.err.account"));
      return;
    }
    if (!files.length && !driveLinks.trim()) {
      setErr(t("reports.err.file"));
      return;
    }
    start(async () => {
      const fd = new FormData();
      fd.set("account_id", account);
      if (accSlug === "swift") fd.set("report_portal", reportPortal);
      for (const f of files) fd.append("file", f);
      if (driveLinks.trim()) fd.set("drive_links", driveLinks);
      const r = await uploadEod(fd);
      setResult(r);
      if (r.ok) {
        setFiles([]);
        setDriveLinks("");
        router.refresh();
      }
    });
  };

  return (
    <div>
      <div className="field-label" style={{ marginLeft: 3 }}>
        {t("reports.account")}
      </div>
      <Segmented
        options={accounts.map((a) => ({ value: a.id, label: a.name }))}
        value={account}
        onChange={setAccount}
      />
      {accSlug === "swift" && (
        <>
          <div className="field-label" style={{ marginLeft: 3, marginTop: 10 }}>
            {t("reports.portal")}
          </div>
          <Segmented
            options={[
              { value: "PT", label: "PT" },
              { value: "HT", label: "HT" },
            ]}
            value={reportPortal}
            onChange={(v) => setReportPortal(v as "HT" | "PT")}
          />
        </>
      )}
      <div className="spacer" />
      <SectionLabel style={{ marginTop: 6 }}>{t("reports.upload_pemo")}</SectionLabel>
      <FileDrop
        accept=".csv,.xlsx,.xls"
        acceptLabel="CSV or XLSX"
        files={files}
        onFiles={setFiles}
        label={t("reports.choose_pemo")}
      />
      {files.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {files.map((f, i) => (
            <span
              key={f.name + i}
              className="badge mute"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 8px" }}
            >
              {f.name}
              <button
                type="button"
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "inherit", display: "flex" }}
                aria-label={`Remove ${f.name}`}
              >
                <Icon name="x" size={13} w={2.4} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="spacer" />
      <DrivePickerBtn
        onFiles={(f) => setFiles((prev) => [...prev, ...f])}
        onError={setErr}
      />
      <div className="spacer" />
      <Field
        label={t("reports.drive")}
        value={driveLinks}
        onChange={setDriveLinks}
        placeholder={t("reports.drive.ph")}
        hint={t("reports.drive.hint")}
        multiline
      />
      {err && <InlineErr>{err}</InlineErr>}
      <div className="spacer" />
      <Btn onClick={importSheet} busy={busy} busyLabel={t("reports.importing")}>
        <Icon name="upload" size={18} /> {t("reports.import")}
      </Btn>

      {result && !result.ok && (
        <div className="result-box err">
          <div className="result-title">
            <Icon name="bell" size={16} w={2.4} /> Import rejected
          </div>
          {result.errors.slice(0, 8).map((e, i) => (
            <div className="result-line" key={i}>
              <span>Row {e.row}{e.field ? ` · ${e.field}` : ""}</span>
              <b style={{ fontFamily: "var(--font-ui)", fontWeight: 600 }}>{e.message}</b>
            </div>
          ))}
        </div>
      )}

      {result && result.ok && (
        <>
          <div className="result-box">
            <div className="result-title">
              <Icon name="check" size={18} w={2.4} />{" "}
              {fmt(t("reports.imported_rows"), { n: result.summary.rows })}
            </div>
            <div className="result-line">
              <span>{t("reports.transferred_total")}</span>
              <b>{formatINR(result.summary.transferred)}</b>
            </div>
            <div className="result-line">
              <span>{t("reports.reversed_total")}</span>
              <b>{formatINR(result.summary.reversed)}</b>
            </div>
            <div className="result-line">
              <span>{t("reports.affected_dates")}</span>
              <b>{result.summary.affected_dates.map(formatShortDate).join(", ")}</b>
            </div>
            <div className="result-line">
              <span>{t("reports.auto_created")}</span>
              <b>{result.summary.new_retailers.length}</b>
            </div>
            {result.summary.new_retailers.map((r) => (
              <div className="result-line" key={r.code}>
                <span>{r.code}</span>
                <b>{r.phone ?? "—"}</b>
              </div>
            ))}
          </div>
          {result.summary.unmatched_transfers > 0 && (
            <div className="result-box err" style={{ marginTop: 12 }}>
              <div className="result-title">
                <Icon name="bell" size={16} w={2.4} />{" "}
                {fmt(t("reports.unmatched"), { n: result.summary.unmatched_transfers })}
              </div>
              <p className="fmt-list" style={{ margin: "6px 0 0" }}>
                {t("reports.unmatched_sub")}
              </p>
            </div>
          )}
          {(result.summary.duplicates ?? 0) > 0 && (
            <div className="result-box" style={{ marginTop: 12 }}>
              <div className="result-title">
                <Icon name="refresh" size={16} w={2.4} />{" "}
                {fmt(t("reports.duplicates"), { n: result.summary.duplicates })}
              </div>
            </div>
          )}
          {(result.summary.skipped?.length ?? 0) > 0 && (
            <div className="result-box err" style={{ marginTop: 12 }}>
              <div className="result-title">
                <Icon name="bell" size={16} w={2.4} />{" "}
                {fmt(t("reports.skipped"), { n: result.summary.skipped.length })}
              </div>
              {result.summary.skipped.slice(0, 12).map((sk, i) => (
                <p className="fmt-list" style={{ margin: "5px 0 0" }} key={i}>
                  {sk.message}
                </p>
              ))}
            </div>
          )}
        </>
      )}

      <SectionLabel>{t("reports.formats")}</SectionLabel>
      <div className="card">
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{t("reports.fmt1")}</div>
        <div className="fmt-list">
          {t("reports.fmt1_cols")} <code>RequestId</code>, <code>Merchant MobileNo</code>,{" "}
          <code>Merchant</code>, <code>Amount</code> (signed), <code>Narration</code>,{" "}
          <code>Transfer Date</code>
        </div>
        <div className="divider" />
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{t("reports.fmt2")}</div>
        <div className="fmt-list">
          <code>retailer_code</code>, <code>retailer_name?</code>, <code>retailer_phone?</code>,{" "}
          <code>type</code>, <code>amount</code>, <code>txn_date?</code>,{" "}
          <code>bank_reference?</code>, <code>notes?</code>
        </div>
        <div
          className="fmt-list"
          style={{
            marginTop: 8,
            background: "var(--surface-2)",
            borderRadius: 8,
            padding: "8px 10px",
          }}
        >
          <code style={{ background: "none", padding: 0 }}>
            RT-2041,Ramesh,+91…,transfer,12000,2026-06-08,UTR8841920,
          </code>
        </div>
        <p className="fmt-list" style={{ marginTop: 10 }}>
          {t("reports.atomic_note")}
        </p>
      </div>
    </div>
  );
}

function CashReport({
  accounts,
  activeSlug,
  recon,
}: {
  accounts: AccountOpt[];
  activeSlug: string;
  recon: ReconRow[];
}) {
  const { t } = useT();
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [driveLinks, setDriveLinks] = useState("");
  const [err, setErr] = useState("");
  const [result, setResult] = useState<CashReportResult | null>(null);
  const [busy, start] = useTransition();

  const importBook = () => {
    setErr("");
    if (!files.length && !driveLinks.trim()) {
      setErr(t("reports.err.xlsx"));
      return;
    }
    start(async () => {
      const fd = new FormData();
      for (const f of files) fd.append("file", f);
      if (driveLinks.trim()) fd.set("drive_links", driveLinks);
      const r = await uploadCashReport(fd);
      setResult(r);
      if (r.ok) {
        setFiles([]);
        setDriveLinks("");
        router.refresh();
      }
    });
  };

  const [fFrom, setFFrom] = useState(todayIst());
  const [fTo, setFTo] = useState(todayIst());
  const [fQuery, setFQuery] = useState("");
  const [fOnlyDiff, setFOnlyDiff] = useState(false);

  const filtered = recon.filter((r) => {
    if (fFrom && r.date < fFrom) return false;
    if (fTo && r.date > fTo) return false;
    if (fOnlyDiff && Math.abs(r.book - r.system) < 0.01) return false;
    if (fQuery) {
      const q = fQuery.trim().toLowerCase();
      if (!r.code.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const mismatches = filtered.filter((r) => Math.abs(r.book - r.system) >= 0.01).length;

  const exportXlsx = async () => {
    const XLSX = await import("xlsx");
    const rows = filtered.map((r) => ({
      Date: r.date,
      Retailer: r.name || r.code,
      Code: r.code,
      "Book (₹)": r.book,
      "System (₹)": r.system,
      "Diff (₹)": Math.round((r.book - r.system) * 100) / 100,
    }));
    rows.push({
      Date: "TOTAL",
      Retailer: "",
      Code: "",
      "Book (₹)": filtered.reduce((s, r) => s + r.book, 0),
      "System (₹)": filtered.reduce((s, r) => s + r.system, 0),
      "Diff (₹)":
        Math.round(filtered.reduce((s, r) => s + (r.book - r.system), 0) * 100) / 100,
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 11 }, { wch: 30 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reconciliation");
    XLSX.writeFile(wb, `reconciliation-${activeSlug}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const bookTotal = filtered.reduce((s, r) => s + r.book, 0);
  const sysTotal = filtered.reduce((s, r) => s + r.system, 0);
  const slugToName = new Map(accounts.map((a) => [a.slug, a.name]));

  return (
    <div>
      <SectionLabel style={{ marginTop: 6 }}>{t("reports.upload_book")}</SectionLabel>
      <p className="fmt-list">{t("reports.book_note")}</p>
      <div className="spacer" />
      <FileDrop
        accept=".xlsx,.xls"
        acceptLabel="XLSX"
        files={files}
        onFiles={setFiles}
        label={t("reports.choose_book")}
      />
      {files.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {files.map((f, i) => (
            <span
              key={f.name + i}
              className="badge mute"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 8px" }}
            >
              {f.name}
              <button
                type="button"
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "inherit", display: "flex" }}
                aria-label={`Remove ${f.name}`}
              >
                <Icon name="x" size={13} w={2.4} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="spacer" />
      <DrivePickerBtn
        onFiles={(f) => setFiles((prev) => [...prev, ...f])}
        onError={setErr}
      />
      <div className="spacer" />
      <Field
        label={t("reports.drive")}
        value={driveLinks}
        onChange={setDriveLinks}
        placeholder={t("reports.drive.ph")}
        hint={t("reports.drive.hint")}
        multiline
      />
      {err && <InlineErr>{err}</InlineErr>}
      <div className="spacer" />
      <Btn onClick={importBook} busy={busy} busyLabel={t("reports.importing")}>
        <Icon name="upload" size={18} /> {t("reports.import_book")}
      </Btn>

      {result && !result.ok && (
        <div className="result-box err">
          <div className="result-title">
            <Icon name="bell" size={16} w={2.4} /> {result.error}
          </div>
        </div>
      )}

      {result && result.ok && (
        <div className="result-box">
          <div className="result-title">
            <Icon name="check" size={18} w={2.4} />{" "}
            {fmt(t("reports.imported_entries"), { n: result.summary.rows })}
          </div>
          <div className="result-line">
            <span>{t("reports.total_cash")}</span>
            <b>{formatINR(result.summary.total_amount)}</b>
          </div>
          <div className="result-line">
            <span>{t("reports.sheets")}</span>
            <b>{result.summary.sheets_processed.join(", ")}</b>
          </div>
          {Object.entries(result.summary.per_account).map(([slug, info]) => (
            <div className="result-line" key={slug}>
              <span>{slugToName.get(slug) ?? slug}</span>
              <b>
                {fmt(t("reports.rows"), { n: info.rows })} · {formatINR(info.amount)}
              </b>
            </div>
          ))}
          <div className="result-line">
            <span>{t("reports.covered_dates")}</span>
            <b>{result.summary.covered_dates.map(formatShortDate).join(", ")}</b>
          </div>
          <div className="result-line">
            <span>{t("reports.auto_created")}</span>
            <b>{result.summary.new_retailers.length}</b>
          </div>
          {(result.summary.warnings ?? []).map((w, i) => (
            <div className="result-line" key={"w" + i} style={{ color: "var(--warn)" }}>
              <span>
                <Icon name="bell" size={14} w={2.4} /> {w}
              </span>
            </div>
          ))}
          {!result.summary.covered_dates.includes(
            new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
          ) && (
            <div className="result-line" style={{ color: "var(--warn)" }}>
              <span>
                <Icon name="bell" size={14} w={2.4} />{" "}
                {fmt(t("reports.no_today_col"), {
                  date: formatShortDate(
                    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
                  ),
                })}
              </span>
            </div>
          )}
        </div>
      )}

      <SectionLabel>{t("reports.recon")}</SectionLabel>
      <p className="fmt-list" style={{ marginBottom: 12 }}>
        {t("reports.recon_note")}
      </p>
      <Segmented
        options={accounts.map((a) => ({ value: a.slug, label: a.name }))}
        value={activeSlug}
        onChange={(slug) =>
          router.replace(`/distributor/reports?tab=cash&account=${slug}`, { scroll: false })
        }
      />
      <div className="spacer" />
      {recon.length > 0 && (
        <div className="card" style={{ padding: "12px 16px", marginBottom: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1.4fr",
              gap: 10,
              alignItems: "end",
            }}
          >
            <Field label={t("reports.filter.from")} type="date" value={fFrom} onChange={setFFrom} />
            <Field label={t("reports.filter.to")} type="date" value={fTo} onChange={setFTo} />
            <Field
              label={t("reports.filter.search")}
              value={fQuery}
              onChange={setFQuery}
              placeholder="Nakoda / M9825…"
            />
          </div>
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              marginTop: 10,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className={"mini-btn" + (fOnlyDiff ? " on" : "")}
              style={
                fOnlyDiff
                  ? { background: "var(--accent)", color: "var(--on-accent)", borderColor: "transparent" }
                  : undefined
              }
              onClick={() => setFOnlyDiff(!fOnlyDiff)}
            >
              {t("reports.filter.only_diff")}
            </button>
            <span className="muted" style={{ fontSize: 12.5 }}>
              {fmt(t("reports.filtered_rows"), { n: filtered.length, total: recon.length })}
              {mismatches > 0 && (
                <>
                  {" · "}
                  <b style={{ color: "var(--warn)" }}>
                    {fmt(t("reports.mismatch_count"), { n: mismatches })}
                  </b>
                </>
              )}
            </span>
            <div style={{ marginLeft: "auto" }}>
              <Btn variant="soft" full={false} onClick={exportXlsx} disabled={!filtered.length}>
                <Icon name="file" size={16} /> {t("reports.export")}
              </Btn>
            </div>
          </div>
        </div>
      )}
      {filtered.length ? (
        <div className="card" style={{ padding: "8px 16px 4px" }}>
          <table className="dtable">
            <thead>
              <tr>
                <th>{t("out.col.date")}</th>
                <th>{t("reports.col.retailer")}</th>
                <th>{t("reports.col.book")}</th>
                <th>{t("reports.col.system")}</th>
                <th>{t("reports.col.diff")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => {
                const diff = r.book - r.system;
                return (
                  <tr key={i}>
                    <td>{formatShortDate(r.date)}</td>
                    <td style={{ fontFamily: "var(--font-ui)", fontWeight: 600 }}>
                      {r.code || r.name}
                    </td>
                    <td>{kShort(r.book, 1)}</td>
                    <td>{kShort(r.system, 1)}</td>
                    <td className={diff === 0 ? "diff-zero" : "diff-pos"}>
                      {diff === 0
                        ? "—"
                        : (diff > 0 ? "+" : "−") + kShort(Math.abs(diff), 1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>{fmt(t("reports.rows"), { n: filtered.length })}</td>
                <td></td>
                <td>{kShort(bookTotal, 1)}</td>
                <td>{kShort(sysTotal, 1)}</td>
                <td className={bookTotal - sysTotal === 0 ? "diff-zero" : "diff-pos"}>
                  {kShort(bookTotal - sysTotal, 1)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <Empty icon="cash" title={t("reports.empty")} />
      )}
    </div>
  );
}

type EodTxnItem = {
  date: string;
  retailer: string;
  code: string;
  type: "transfer" | "reversal";
  amount: number;
  ref: string;
};

function EodTxnsTable({
  txns,
  accounts,
  activeSlug,
}: {
  txns: EodTxnItem[];
  accounts: AccountOpt[];
  activeSlug: string;
}) {
  const { t } = useT();
  const router = useRouter();
  const [fFrom, setFFrom] = useState(todayIst());
  const [fTo, setFTo] = useState(todayIst());
  const [fQuery, setFQuery] = useState("");
  const [fType, setFType] = useState<"all" | "transfer" | "reversal">("all");

  const filtered = txns.filter((x) => {
    if (fFrom && x.date < fFrom) return false;
    if (fTo && x.date > fTo) return false;
    if (fType !== "all" && x.type !== fType) return false;
    if (fQuery) {
      const q = fQuery.trim().toLowerCase();
      if (
        !x.retailer.toLowerCase().includes(q) &&
        !x.code.toLowerCase().includes(q) &&
        !x.ref.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });
  const transferred = filtered.filter((x) => x.type === "transfer").reduce((s, x) => s + x.amount, 0);
  const reversed = filtered.filter((x) => x.type === "reversal").reduce((s, x) => s + x.amount, 0);

  const exportXlsx = async () => {
    const XLSX = await import("xlsx");
    const data = filtered.map((x) => ({
      Date: x.date,
      Retailer: x.retailer,
      Code: x.code,
      Type: x.type,
      "Amount (₹)": x.amount,
      Reference: x.ref,
    }));
    data.push({
      Date: "TOTAL",
      Retailer: `${t("eod.type.transfer")} ${transferred} / ${t("eod.type.reversal")} ${reversed}`,
      Code: "",
      Type: "net" as never,
      "Amount (₹)": transferred - reversed,
      Reference: "",
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 11 }, { wch: 32 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "EOD transactions");
    XLSX.writeFile(wb, `eod-${activeSlug}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <>
      <SectionLabel>{t("eod.txns")}</SectionLabel>
      <p className="fmt-list" style={{ marginBottom: 12 }}>{t("eod.txns_note")}</p>
      <Segmented
        options={accounts.map((a) => ({ value: a.slug, label: a.name }))}
        value={activeSlug}
        onChange={(slug) => router.replace(`/distributor/reports?account=${slug}`, { scroll: false })}
      />
      <div className="spacer" />
      {txns.length > 0 && (
        <div className="card" style={{ padding: "12px 16px", marginBottom: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr", gap: 10, alignItems: "end" }}>
            <Field label={t("reports.filter.from")} type="date" value={fFrom} onChange={setFFrom} />
            <Field label={t("reports.filter.to")} type="date" value={fTo} onChange={setFTo} />
            <Field label={t("reports.filter.search")} value={fQuery} onChange={setFQuery} placeholder="Nakoda / UTR…" />
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            <Segmented
              options={[
                { value: "all", label: t("eod.type.all") },
                { value: "transfer", label: t("eod.type.transfer") },
                { value: "reversal", label: t("eod.type.reversal") },
              ]}
              value={fType}
              onChange={(v) => setFType(v as typeof fType)}
            />
            <span className="muted" style={{ fontSize: 12.5 }}>
              {fmt(t("reports.filtered_rows"), { n: filtered.length, total: txns.length })}
            </span>
            <div style={{ marginLeft: "auto" }}>
              <Btn variant="soft" full={false} onClick={exportXlsx} disabled={!filtered.length}>
                <Icon name="file" size={16} /> {t("reports.export")}
              </Btn>
            </div>
          </div>
        </div>
      )}
      {filtered.length ? (
        <div className="card" style={{ padding: "8px 16px 4px" }}>
          <table className="dtable">
            <thead>
              <tr>
                <th>{t("out.col.date")}</th>
                <th>{t("reports.col.retailer")}</th>
                <th>{t("eod.col.type")}</th>
                <th>{t("eod.col.ref")}</th>
                <th style={{ textAlign: "right" }}>₹</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map((x, i) => (
                <tr key={i}>
                  <td>{formatShortDate(x.date)}</td>
                  <td style={{ fontFamily: "var(--font-ui)", fontWeight: 600 }}>
                    {x.retailer}
                  </td>
                  <td>
                    <span className={"badge " + (x.type === "transfer" ? "ok" : "warn")}>
                      {x.type === "transfer" ? t("eod.type.transfer") : t("eod.type.reversal")}
                    </span>
                  </td>
                  <td className="muted" style={{ fontSize: 11.5 }}>{x.ref || "—"}</td>
                  <td style={{ textAlign: "right" }} className={x.type === "reversal" ? "diff-pos" : ""}>
                    {x.type === "reversal" ? "−" : ""}
                    {kShort(x.amount, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>{fmt(t("reports.rows"), { n: filtered.length })}</td>
                <td></td>
                <td className="pos">+{kShort(transferred, 1)}</td>
                <td className="neg">−{kShort(reversed, 1)}</td>
                <td style={{ textAlign: "right" }}>
                  {t("eod.net")} {kShort(transferred - reversed, 1)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <Empty icon="file" title={t("reports.empty")} />
      )}
    </>
  );
}

type EodReconItem = { date: string; code: string; name: string; file: number; app: number };

function EodReconTable({ rows, activeSlug }: { rows: EodReconItem[]; activeSlug: string }) {
  const { t } = useT();
  const [fFrom, setFFrom] = useState(todayIst());
  const [fTo, setFTo] = useState(todayIst());
  const [fQuery, setFQuery] = useState("");
  const [fOnlyDiff, setFOnlyDiff] = useState(false);

  const filtered = rows.filter((r) => {
    if (fFrom && r.date < fFrom) return false;
    if (fTo && r.date > fTo) return false;
    if (fOnlyDiff && Math.abs(r.file - r.app) < 0.01) return false;
    if (fQuery) {
      const q = fQuery.trim().toLowerCase();
      if (!r.code.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const mismatches = filtered.filter((r) => Math.abs(r.file - r.app) >= 0.01).length;
  const fileTotal = filtered.reduce((s, r) => s + r.file, 0);
  const appTotal = filtered.reduce((s, r) => s + r.app, 0);

  const exportXlsx = async () => {
    const XLSX = await import("xlsx");
    const data = filtered.map((r) => ({
      Date: r.date,
      Retailer: r.name,
      Code: r.code,
      "File (₹)": r.file,
      "App (₹)": r.app,
      "Diff (₹)": Math.round((r.file - r.app) * 100) / 100,
    }));
    data.push({
      Date: "TOTAL",
      Retailer: "",
      Code: "",
      "File (₹)": fileTotal,
      "App (₹)": appTotal,
      "Diff (₹)": Math.round((fileTotal - appTotal) * 100) / 100,
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 11 }, { wch: 30 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "File vs App");
    XLSX.writeFile(wb, `eod-vs-app-${activeSlug}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <>
      <SectionLabel>{t("eod.recon")}</SectionLabel>
      <p className="fmt-list" style={{ marginBottom: 12 }}>{t("eod.recon_note")}</p>
      {rows.length > 0 && (
        <div className="card" style={{ padding: "12px 16px", marginBottom: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr", gap: 10, alignItems: "end" }}>
            <Field label={t("reports.filter.from")} type="date" value={fFrom} onChange={setFFrom} />
            <Field label={t("reports.filter.to")} type="date" value={fTo} onChange={setFTo} />
            <Field label={t("reports.filter.search")} value={fQuery} onChange={setFQuery} placeholder="Nakoda / M9825…" />
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className="mini-btn"
              style={
                fOnlyDiff
                  ? { background: "var(--accent)", color: "var(--on-accent)", borderColor: "transparent" }
                  : undefined
              }
              onClick={() => setFOnlyDiff(!fOnlyDiff)}
            >
              {t("reports.filter.only_diff")}
            </button>
            <span className="muted" style={{ fontSize: 12.5 }}>
              {fmt(t("reports.filtered_rows"), { n: filtered.length, total: rows.length })}
              {mismatches > 0 && (
                <>
                  {" · "}
                  <b style={{ color: "var(--warn)" }}>
                    {fmt(t("reports.mismatch_count"), { n: mismatches })}
                  </b>
                </>
              )}
            </span>
            <div style={{ marginLeft: "auto" }}>
              <Btn variant="soft" full={false} onClick={exportXlsx} disabled={!filtered.length}>
                <Icon name="file" size={16} /> {t("reports.export")}
              </Btn>
            </div>
          </div>
        </div>
      )}
      {filtered.length ? (
        <div className="card" style={{ padding: "8px 16px 4px" }}>
          <table className="dtable">
            <thead>
              <tr>
                <th>{t("out.col.date")}</th>
                <th>{t("reports.col.retailer")}</th>
                <th>{t("reports.col.file")}</th>
                <th>{t("reports.col.app")}</th>
                <th>{t("reports.col.diff")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map((r, i) => {
                const diff = r.file - r.app;
                return (
                  <tr key={i}>
                    <td>{formatShortDate(r.date)}</td>
                    <td style={{ fontFamily: "var(--font-ui)", fontWeight: 600 }}>{r.name}</td>
                    <td>{kShort(r.file, 1)}</td>
                    <td>{kShort(r.app, 1)}</td>
                    <td className={Math.abs(diff) < 0.01 ? "diff-zero" : "diff-pos"}>
                      {Math.abs(diff) < 0.01 ? "—" : (diff > 0 ? "+" : "−") + kShort(Math.abs(diff), 1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>{fmt(t("reports.rows"), { n: filtered.length })}</td>
                <td></td>
                <td>{kShort(fileTotal, 1)}</td>
                <td>{kShort(appTotal, 1)}</td>
                <td className={Math.abs(fileTotal - appTotal) < 0.01 ? "diff-zero" : "diff-pos"}>
                  {kShort(fileTotal - appTotal, 1)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <Empty icon="check" title={t("reports.empty")} />
      )}
    </>
  );
}

export default function ReportsView({
  initialTab,
  accounts,
  activeSlug,
  recon,
  eodTxns,
  eodRecon,
}: {
  initialTab: "eod" | "cash";
  accounts: AccountOpt[];
  activeSlug: string;
  recon: ReconRow[];
  eodTxns: EodTxnItem[];
  eodRecon: EodReconItem[];
}) {
  const { t } = useT();
  const [tab, setTab] = useState<"eod" | "cash">(initialTab);

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="subtabs">
        <button
          type="button"
          className={"subtab" + (tab === "eod" ? " on" : "")}
          onClick={() => setTab("eod")}
        >
          {t("reports.eod_tab")}
        </button>
        <button
          type="button"
          className={"subtab" + (tab === "cash" ? " on" : "")}
          onClick={() => setTab("cash")}
        >
          {t("reports.cash_tab")}
        </button>
      </div>
      {tab === "eod" ? (
        <>
          <EodUpload accounts={accounts} />
          <EodTxnsTable txns={eodTxns} accounts={accounts} activeSlug={activeSlug} />
          <EodReconTable rows={eodRecon} activeSlug={activeSlug} />
        </>
      ) : (
        <CashReport accounts={accounts} activeSlug={activeSlug} recon={recon} />
      )}
    </div>
  );
}
