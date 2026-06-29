"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { adjustOutstanding, setDefaulter } from "@/lib/actions/settings";
import { useT, fmt } from "@/lib/i18n";
import { formatShortDate, kShort } from "@/lib/format";
import { formatINR } from "@/lib/utils";
import { Btn, Empty, Field, Icon, InlineErr, Segmented, Selectt, Toast, type ToastMsg } from "@/lib/ui";

export type AccountSplit = {
  slug: string;
  name: string;
  opening: number;
  transferred: number;
  reversed: number;
  cash: number;
  outstanding: number;
};

export type OutRow = {
  id: string;
  code: string;
  name: string;
  fos: string | null;
  needsFos: boolean;
  inactive: boolean;
  opening: number;
  transferred: number;
  reversed: number;
  cash: number;
  outstanding: number;
  defaulted: boolean;
  atRisk: boolean;
  personal?: boolean;
  // Present only in the combined "A2Z + Swift" view: per-account breakdown.
  splits?: AccountSplit[];
};

type DailyRow = {
  balance_date: string;
  opening: string;
  transferred: string;
  reversed: string;
  cash_received: string;
  closing: string;
};

function AdjustModal({
  r,
  accountId,
  accountName,
  onClose,
  onDone,
}: {
  r: OutRow;
  accountId: string;
  accountName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useT();
  const [target, setTarget] = useState(String(Math.round(r.outstanding)));
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, start] = useTransition();

  const submit = () => {
    setErr("");
    start(async () => {
      const fd = new FormData();
      fd.set("retailer_id", r.id);
      fd.set("account_id", accountId);
      fd.set("target", target);
      fd.set("notes", notes);
      const res = await adjustOutstanding(fd);
      if ("error" in res) {
        setErr(res.error === "no_change" ? t("out.adjust.no_change") : res.error);
        setConfirming(false);
        return;
      }
      onDone();
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "grid",
        placeItems: "center",
        background: "color-mix(in srgb, var(--ink) 40%, transparent)",
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: 400, maxWidth: "92vw", padding: 22 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em", marginBottom: 4 }}>
          {t("out.adjust.title")}
        </div>
        <div className="row-sub" style={{ marginBottom: 14 }}>
          {r.name} · {accountName}
        </div>
        <div className="out-line" style={{ marginTop: 0, marginBottom: 14 }}>
          <span>{t("out.adjust.current")}</span>
          <b>{formatINR(r.outstanding)}</b>
        </div>
        {confirming ? (
          <>
            <p className="lead" style={{ margin: "0 0 16px" }}>
              {fmt(t("out.adjust.confirm"), {
                name: r.name,
                account: accountName,
                from: formatINR(r.outstanding),
                to: formatINR(Number(target)),
              })}
            </p>
            {err && <InlineErr>{err}</InlineErr>}
            <div className="appr-actions two" style={{ marginTop: 8 }}>
              <Btn variant="ghost" onClick={() => setConfirming(false)}>
                {t("common.cancel")}
              </Btn>
              <Btn variant="primary" onClick={submit} busy={busy} busyLabel="…">
                {t("common.confirm")}
              </Btn>
            </div>
          </>
        ) : (
          <>
            <Field
              label={t("out.adjust.target")}
              value={target}
              onChange={(v) => setTarget(v.replace(/[^\d-]/g, ""))}
              inputMode="numeric"
              prefix="₹"
              autoFocus
            />
            <Field
              label={t("appr.notes")}
              value={notes}
              onChange={setNotes}
              placeholder={t("out.adjust.note_hint")}
            />
            {err && <InlineErr>{err}</InlineErr>}
            <div className="appr-actions two" style={{ marginTop: 8 }}>
              <Btn variant="ghost" onClick={onClose}>
                {t("common.cancel")}
              </Btn>
              <Btn
                variant="primary"
                onClick={() => setConfirming(true)}
                disabled={target === "" || Number(target) === Math.round(r.outstanding)}
              >
                {t("out.adjust")}
              </Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function OutItem({
  r,
  accountId,
  accountName,
  combined,
  canAdjust,
  onAdjusted,
  onChanged,
}: {
  r: OutRow;
  accountId: string | null;
  accountName: string;
  combined: boolean;
  canAdjust: boolean;
  onAdjusted: () => void;
  onChanged: () => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [markBusy, startMark] = useTransition();

  const toggleDefaulter = () => {
    startMark(async () => {
      const fd = new FormData();
      fd.set("retailer_id", r.id);
      fd.set("on", String(!r.defaulted));
      const res = await setDefaulter(fd);
      if (!("error" in res)) onChanged();
    });
  };
  const [daily, setDaily] = useState<DailyRow[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);

  useEffect(() => {
    if (open && !combined && daily === null) {
      fetch(`/api/retailer/${r.id}/balances?account_id=${accountId}`)
        .then((res) => res.json())
        .then((data) => setDaily(data.rows ?? []))
        .catch(() => setDaily([]));
    }
  }, [open, combined, daily, r.id, accountId]);

  useEffect(() => {
    if (ref.current) setH(open ? ref.current.scrollHeight : 0);
  }, [open, daily]);

  return (
    <div className={"out-item" + (open ? " open" : "")}>
      <button type="button" className="out-row" onClick={() => setOpen(!open)}>
        <span className="out-chev">
          <Icon name="chev" size={18} />
        </span>
        <span className="out-rt">
          <span className="out-rt-name">
            {r.name}
            {canAdjust && r.defaulted && <span className="badge neg">{t("def.badge.defaulter")}</span>}
            {canAdjust && !r.defaulted && r.atRisk && (
              <span className="badge warn">{t("def.badge.atrisk")}</span>
            )}
            {r.needsFos && <span className="badge warn">{t("out.needs_fos")}</span>}
            {r.inactive && <span className="badge mute">{t("out.inactive")}</span>}
          </span>
          <span className="out-rt-sub">
            {r.code} · {r.fos || t("out.unassigned")}
          </span>
        </span>
        <span className="out-amt">
          <span className="out-amt-val">{formatINR(r.outstanding)}</span>
          <span className="out-amt-lbl">{t("out.outstanding_lbl")}</span>
        </span>
      </button>
      <div className="expand-wrap" style={{ height: h }}>
        <div className="out-detail" ref={ref}>
          <div className="out-detail-grid">
            <div className="out-mini">
              <div className="out-mini-l">{t("out.col.open")}</div>
              <div className="out-mini-v">{formatINR(r.opening, false)}</div>
            </div>
            <div className="out-mini">
              <div className="out-mini-l">{t("out.transferred")}</div>
              <div className="out-mini-v pos">{formatINR(r.transferred, false)}</div>
            </div>
            <div className="out-mini">
              <div className="out-mini-l">{t("out.reversed")}</div>
              <div className="out-mini-v neg">{formatINR(r.reversed, false)}</div>
            </div>
            <div className="out-mini">
              <div className="out-mini-l">{t("out.cash")}</div>
              <div className="out-mini-v neg">{formatINR(r.cash, false)}</div>
            </div>
            <div className="out-mini">
              <div className="out-mini-l">{t("out.outstanding")}</div>
              <div className="out-mini-v">{formatINR(r.outstanding, false)}</div>
            </div>
          </div>
          {canAdjust && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
              <button
                type="button"
                className="mini-btn"
                onClick={toggleDefaulter}
                disabled={markBusy}
                style={r.defaulted ? undefined : { color: "var(--neg)", borderColor: "var(--neg)" }}
              >
                {markBusy ? "…" : r.defaulted ? t("def.clear") : t("def.mark")}
              </button>
            </div>
          )}
          {combined ? (
            <table className="dtable">
              <thead>
                <tr>
                  <th>{t("out.col.account")}</th>
                  <th>{t("out.col.open")}</th>
                  <th>{t("out.col.in")}</th>
                  <th>{t("out.col.rev")}</th>
                  <th>{t("out.col.cash")}</th>
                  <th>{t("out.col.close")}</th>
                </tr>
              </thead>
              <tbody>
                {(r.splits ?? []).map((sp) => (
                  <tr key={sp.slug}>
                    <td>{sp.name}</td>
                    <td>{kShort(sp.opening)}</td>
                    <td className="pos">{sp.transferred ? "+" + kShort(sp.transferred) : "—"}</td>
                    <td className="neg">{sp.reversed ? "−" + kShort(sp.reversed) : "—"}</td>
                    <td className="neg">{sp.cash ? "−" + kShort(sp.cash) : "—"}</td>
                    <td className="close">{kShort(sp.outstanding, 1)}</td>
                  </tr>
                ))}
                {(r.splits ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", color: "var(--ink-3)" }}>
                      —
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <>
              {canAdjust && (
                <>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                    <button type="button" className="mini-btn" onClick={() => setAdjusting(true)}>
                      {t("out.adjust")}
                    </button>
                  </div>
                  {adjusting && accountId && (
                    <AdjustModal
                      r={r}
                      accountId={accountId}
                      accountName={accountName}
                      onClose={() => setAdjusting(false)}
                      onDone={() => {
                        setAdjusting(false);
                        onAdjusted();
                      }}
                    />
                  )}
                </>
              )}
              <table className="dtable">
                <thead>
                  <tr>
                    <th>{t("out.col.date")}</th>
                    <th>{t("out.col.open")}</th>
                    <th>{t("out.col.in")}</th>
                    <th>{t("out.col.rev")}</th>
                    <th>{t("out.col.cash")}</th>
                    <th>{t("out.col.close")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(daily ?? []).map((d) => (
                    <tr key={d.balance_date}>
                      <td>{formatShortDate(d.balance_date)}</td>
                      <td>{kShort(Number(d.opening))}</td>
                      <td className="pos">
                        {Number(d.transferred) ? "+" + kShort(Number(d.transferred)) : "—"}
                      </td>
                      <td className="neg">
                        {Number(d.reversed) ? "−" + kShort(Number(d.reversed)) : "—"}
                      </td>
                      <td className="neg">
                        {Number(d.cash_received) ? "−" + kShort(Number(d.cash_received)) : "—"}
                      </td>
                      <td className="close">{kShort(Number(d.closing), 1)}</td>
                    </tr>
                  ))}
                  {daily !== null && daily.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", color: "var(--ink-3)" }}>
                        —
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OutstandingView({
  accounts,
  activeSlug,
  activeName,
  accountId,
  combined,
  preset,
  from,
  to,
  rows,
  todayPulse,
  personalTotal = 0,
  canAdjust = true,
  hideFosFilter = false,
  basePath = "/distributor/outstanding",
}: {
  accounts: { id: string; slug: string; name: string }[];
  activeSlug: string;
  activeName: string;
  accountId: string | null;
  combined: boolean;
  preset: string;
  from: string;
  to: string;
  rows: OutRow[];
  todayPulse?: { transferred: number; reversed: number; cash: number };
  personalTotal?: number;
  // FOS reuses this read-only (no Adjust, no FOS filter) on its own route.
  canAdjust?: boolean;
  hideFosFilter?: boolean;
  basePath?: string;
}) {
  const { t } = useT();
  const router = useRouter();
  const [toast, setToast] = useState<ToastMsg>(null);
  const [query, setQuery] = useState("");
  const [fosFilter, setFosFilter] = useState("__all__");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "atrisk" | "defaulters">(
    "all",
  );
  const [customFrom, setCustomFrom] = useState(preset === "custom" ? from : "");
  const [customTo, setCustomTo] = useState(preset === "custom" ? to : "");
  const [showCustom, setShowCustom] = useState(preset === "custom");

  // Navigate preserving the current account + range selection.
  const go = (params: { account?: string; range?: string; from?: string; to?: string }) => {
    const qs = new URLSearchParams({ account: params.account ?? activeSlug });
    const range = params.range ?? preset;
    qs.set("range", range);
    if (range === "custom") {
      qs.set("from", params.from ?? from);
      qs.set("to", params.to ?? to);
    }
    router.replace(`${basePath}?${qs.toString()}`, { scroll: false });
  };

  const dateInputStyle: CSSProperties = {
    display: "block",
    width: "100%",
    marginTop: 4,
    padding: "7px 10px",
    borderRadius: 8,
    border: "1px solid var(--border-2)",
    background: "var(--surface)",
    color: "var(--ink)",
    fontSize: 13.5,
  };

  const fosNames = Array.from(new Set(rows.map((r) => r.fos).filter(Boolean))) as string[];
  fosNames.sort();

  const filtered = rows
    .filter((r) => {
      if (query) {
        const q = query.trim().toLowerCase();
        if (!r.name.toLowerCase().includes(q) && !r.code.toLowerCase().includes(q)) return false;
      }
      if (fosFilter === "__none__" && r.fos) return false;
      if (fosFilter !== "__all__" && fosFilter !== "__none__" && r.fos !== fosFilter) return false;
      if (statusFilter === "defaulters" && !r.defaulted) return false;
      if (statusFilter === "active" && r.defaulted) return false;
      if (statusFilter === "atrisk" && !r.atRisk) return false;
      return true;
    })
    .sort((a, b) => b.outstanding - a.outstanding);

  const total = filtered.reduce((s, r) => s + r.outstanding, 0);
  const withDues = filtered.filter((r) => r.outstanding > 0).length;
  const inAdvance = filtered.filter((r) => r.outstanding < 0).length;
  // Split: collectible (active) vs defaulted, across ALL rows (not the filtered
  // view) so the headline reflects the true book regardless of the status tab.
  const collectibleTotal = rows.filter((r) => !r.defaulted).reduce((s, r) => s + r.outstanding, 0);
  const defaultedTotal = rows.filter((r) => r.defaulted).reduce((s, r) => s + r.outstanding, 0);
  const defaulterCount = rows.filter((r) => r.defaulted).length;
  const atRiskCount = rows.filter((r) => r.atRisk).length;

  const exportXlsx = async () => {
    const XLSX = await import("xlsx");
    const data = filtered.map((r) => ({
      Code: r.code,
      Retailer: r.name,
      FOS: r.fos ?? "—",
      "Opening (₹)": r.opening,
      "Transferred (₹)": r.transferred,
      "Reversed (₹)": r.reversed,
      "Cash received (₹)": r.cash,
      "Outstanding (₹)": r.outstanding,
    }));
    data.push({
      Code: "TOTAL",
      Retailer: "",
      FOS: "",
      "Opening (₹)": filtered.reduce((s, r) => s + r.opening, 0),
      "Transferred (₹)": filtered.reduce((s, r) => s + r.transferred, 0),
      "Reversed (₹)": filtered.reduce((s, r) => s + r.reversed, 0),
      "Cash received (₹)": filtered.reduce((s, r) => s + r.cash, 0),
      "Outstanding (₹)": total,
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 13 }, { wch: 32 }, { wch: 16 }, { wch: 13 }, { wch: 14 }, { wch: 13 }, { wch: 15 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeName.slice(0, 28));
    XLSX.writeFile(wb, `outstanding-${activeSlug}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div>
      <p className="lead" style={{ marginTop: 0 }}>
        {t("out.lead")}
      </p>
      <Segmented
        options={[
          { value: "all", label: t("out.acct.all") },
          ...accounts.map((a) => ({ value: a.slug, label: a.name })),
        ]}
        value={activeSlug}
        onChange={(slug) => go({ account: slug })}
      />
      <div className="spacer" />
      {todayPulse && (
        <div className="card" style={{ padding: "12px 16px", marginBottom: 12 }}>
          <div className="muted" style={{ fontSize: 11.5, marginBottom: 8 }}>
            {t("today.title")}
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <div>
              <div className="muted" style={{ fontSize: 11.5 }}>{t("out.transferred")}</div>
              <b style={{ fontSize: 15, color: "var(--pos)" }}>+{formatINR(todayPulse.transferred)}</b>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11.5 }}>{t("out.col.cash")}</div>
              <b style={{ fontSize: 15, color: "var(--neg)" }}>−{formatINR(todayPulse.cash)}</b>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11.5 }}>{t("today.net")}</div>
              <b style={{ fontSize: 15 }}>
                {formatINR(todayPulse.transferred - todayPulse.reversed - todayPulse.cash)}
              </b>
            </div>
          </div>
        </div>
      )}
      {personalTotal !== 0 && (
        <div className="card" style={{ padding: "12px 16px", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <div>
              <div className="muted" style={{ fontSize: 11.5 }}>{t("out.receivable")}</div>
              <b style={{ fontSize: 16 }}>{formatINR(collectibleTotal + defaultedTotal)}</b>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11.5 }}>{t("out.personal")}</div>
              <b style={{ fontSize: 16, color: "var(--ink-3)" }}>{formatINR(personalTotal)}</b>
            </div>
          </div>
        </div>
      )}
      <div className="card" style={{ padding: "12px 16px", marginBottom: 12 }}>
        <Segmented
          options={[
            { value: "today", label: t("hist.range.today") },
            { value: "1d", label: t("hist.range.yesterday") },
            { value: "7d", label: t("hist.range.7d") },
            { value: "30d", label: t("hist.range.30d") },
            { value: "full", label: t("hist.range.all") },
          ]}
          value={preset === "custom" ? "" : preset}
          onChange={(r) => go({ range: r })}
        />
        {showCustom ? (
          <div style={{ display: "flex", gap: 10, alignItems: "end", marginTop: 10 }}>
            <label style={{ flex: 1, fontSize: 12.5, color: "var(--ink-3)" }}>
              {t("hist.range.from")}
              <input
                type="date"
                style={dateInputStyle}
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => {
                  setCustomFrom(e.target.value);
                  if (e.target.value && customTo)
                    go({ range: "custom", from: e.target.value, to: customTo });
                }}
              />
            </label>
            <label style={{ flex: 1, fontSize: 12.5, color: "var(--ink-3)" }}>
              {t("hist.range.to")}
              <input
                type="date"
                style={dateInputStyle}
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => {
                  setCustomTo(e.target.value);
                  if (customFrom && e.target.value)
                    go({ range: "custom", from: customFrom, to: e.target.value });
                }}
              />
            </label>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowCustom(true)}
            style={{ marginTop: 10, background: "none", border: "none", color: "var(--ink-2)", cursor: "pointer", fontSize: 12.5, padding: 0 }}
          >
            {t("hist.range.custom")}
          </button>
        )}
      </div>
      {canAdjust && (defaulterCount > 0 || atRiskCount > 0) && (
        <div className="card" style={{ padding: "12px 16px", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 10 }}>
            <div>
              <div className="muted" style={{ fontSize: 11.5 }}>{t("def.split.collectible")}</div>
              <b style={{ fontSize: 15 }}>{formatINR(collectibleTotal)}</b>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11.5 }}>{t("def.split.defaulted")}</div>
              <b style={{ fontSize: 15, color: "var(--neg)" }}>{formatINR(defaultedTotal)}</b>
            </div>
          </div>
          <Segmented
            options={[
              { value: "all", label: t("def.filter.all") },
              { value: "active", label: t("def.filter.active") },
              { value: "atrisk", label: fmt(t("def.filter.atrisk"), { n: atRiskCount }) },
              { value: "defaulters", label: fmt(t("def.filter.defaulters"), { n: defaulterCount }) },
            ]}
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as "all" | "active" | "atrisk" | "defaulters")}
          />
        </div>
      )}
      {rows.length > 0 && (
        <div className="card" style={{ padding: "12px 16px", marginBottom: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: hideFosFilter ? "1fr" : "1.5fr 1fr",
              gap: 10,
              alignItems: "end",
            }}
          >
            <Field
              label={t("out.filter.search")}
              value={query}
              onChange={setQuery}
              placeholder="Nakoda / M9825…"
            />
            {!hideFosFilter && (
              <Selectt
                label={t("out.filter.fos")}
                value={fosFilter}
                onChange={setFosFilter}
                options={[
                  { value: "__all__", label: t("out.filter.all_fos") },
                  ...fosNames.map((f) => ({ value: f, label: f })),
                  { value: "__none__", label: t("out.filter.unassigned") },
                ]}
              />
            )}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            <span className="muted" style={{ fontSize: 12.5 }}>
              {fmt(t("out.filtered"), { n: filtered.length, total: rows.length, amount: formatINR(total) })}
              {" · "}
              <b style={{ color: "var(--warn)" }}>{fmt(t("out.with_dues"), { n: withDues })}</b>
              {inAdvance > 0 && (
                <>
                  {" · "}
                  <b style={{ color: "var(--pos)" }}>{fmt(t("out.advance"), { n: inAdvance })}</b>
                </>
              )}
            </span>
            <div style={{ marginLeft: "auto" }}>
              <Btn variant="soft" full={false} onClick={exportXlsx} disabled={!filtered.length}>
                <Icon name="file" size={16} /> {t("out.export")}
              </Btn>
            </div>
          </div>
        </div>
      )}
      {filtered.length ? (
        <>
          {(
            [
              { key: "active", label: t("def.filter.active"), color: "var(--ink-2)", test: (r: OutRow) => !r.defaulted && !r.atRisk },
              { key: "atrisk", label: t("act.atrisk"), color: "var(--warn)", test: (r: OutRow) => r.atRisk && !r.defaulted },
              { key: "def", label: t("act.defaulters"), color: "var(--ink-3)", test: (r: OutRow) => r.defaulted },
            ] as const
          ).map((g) => {
            const list = filtered.filter(g.test);
            if (!list.length) return null;
            const sub = list.reduce((s, r) => s + r.outstanding, 0);
            return (
              <div key={g.key}>
                <div
                  style={{ display: "flex", alignItems: "center", gap: 7, margin: "16px 4px 4px", paddingTop: 6, borderTop: "0.5px solid var(--border-2)" }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: g.color }} />
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: g.color, textTransform: "uppercase", letterSpacing: ".04em" }}>
                    {g.label} · {list.length}
                  </span>
                  <span className="mono" style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--ink-3)" }}>{formatINR(sub)}</span>
                </div>
                {list.map((r) => (
                  <OutItem
                    key={r.id}
                    r={r}
                    accountId={accountId}
                    accountName={activeName}
                    combined={combined}
                    canAdjust={canAdjust}
                    onAdjusted={() => {
                      setToast({ msg: t("out.adjust.done"), kind: "ok" });
                      router.refresh();
                    }}
                    onChanged={() => {
                      setToast({ msg: t("def.changed"), kind: "ok" });
                      router.refresh();
                    }}
                  />
                ))}
              </div>
            );
          })}
          <div className="kv" style={{ borderTop: "1.5px solid var(--border-2)", marginTop: 4 }}>
            <span className="kv-l">{fmt(t("out.total"), { n: filtered.length })}</span>
            <span className="kv-v mono">{formatINR(total)}</span>
          </div>
        </>
      ) : (
        <Empty icon="wallet" title={fmt(t("out.empty"), { account: activeName })} />
      )}
      <Toast msg={toast?.msg} kind={toast?.kind} onDone={() => setToast(null)} />
    </div>
  );
}
