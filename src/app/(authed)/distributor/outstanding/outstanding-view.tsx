"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adjustOutstanding } from "@/lib/actions/settings";
import { useT, fmt } from "@/lib/i18n";
import { formatShortDate, kShort } from "@/lib/format";
import { formatINR } from "@/lib/utils";
import { Btn, Empty, Field, Icon, InlineErr, Segmented, Selectt, Toast, type ToastMsg } from "@/lib/ui";

type OutRow = {
  id: string;
  code: string;
  name: string;
  fos: string | null;
  needsFos: boolean;
  inactive: boolean;
  transferred: number;
  reversed: number;
  cash: number;
  outstanding: number;
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
  onAdjusted,
}: {
  r: OutRow;
  accountId: string;
  accountName: string;
  onAdjusted: () => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [daily, setDaily] = useState<DailyRow[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);

  useEffect(() => {
    if (open && daily === null) {
      fetch(`/api/retailer/${r.id}/balances?account_id=${accountId}`)
        .then((res) => res.json())
        .then((data) => setDaily(data.rows ?? []))
        .catch(() => setDaily([]));
    }
  }, [open, daily, r.id, accountId]);

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
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button type="button" className="mini-btn" onClick={() => setAdjusting(true)}>
              {t("out.adjust")}
            </button>
          </div>
          {adjusting && (
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
  rows,
}: {
  accounts: { id: string; slug: string; name: string }[];
  activeSlug: string;
  activeName: string;
  accountId: string;
  rows: OutRow[];
}) {
  const { t } = useT();
  const router = useRouter();
  const [toast, setToast] = useState<ToastMsg>(null);
  const [query, setQuery] = useState("");
  const [fosFilter, setFosFilter] = useState("__all__");
  const [minAmt, setMinAmt] = useState("");
  const [sortBy, setSortBy] = useState<"amount" | "name">("amount");

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
      if (minAmt && r.outstanding < Number(minAmt)) return false;
      return true;
    })
    .sort((a, b) =>
      sortBy === "amount" ? b.outstanding - a.outstanding : a.name.localeCompare(b.name),
    );

  const total = filtered.reduce((s, r) => s + r.outstanding, 0);
  const withDues = filtered.filter((r) => r.outstanding > 0).length;
  const inAdvance = filtered.filter((r) => r.outstanding < 0).length;

  const exportXlsx = async () => {
    const XLSX = await import("xlsx");
    const data = filtered.map((r) => ({
      Code: r.code,
      Retailer: r.name,
      FOS: r.fos ?? "—",
      "Transferred (₹)": r.transferred,
      "Reversed (₹)": r.reversed,
      "Cash received (₹)": r.cash,
      "Outstanding (₹)": r.outstanding,
    }));
    data.push({
      Code: "TOTAL",
      Retailer: "",
      FOS: "",
      "Transferred (₹)": filtered.reduce((s, r) => s + r.transferred, 0),
      "Reversed (₹)": filtered.reduce((s, r) => s + r.reversed, 0),
      "Cash received (₹)": filtered.reduce((s, r) => s + r.cash, 0),
      "Outstanding (₹)": total,
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 13 }, { wch: 32 }, { wch: 16 }, { wch: 14 }, { wch: 13 }, { wch: 15 }, { wch: 15 }];
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
        options={accounts.map((a) => ({ value: a.slug, label: a.name }))}
        value={activeSlug}
        onChange={(slug) =>
          router.replace(`/distributor/outstanding?account=${slug}`, { scroll: false })
        }
      />
      <div className="spacer" />
      {rows.length > 0 && (
        <div className="card" style={{ padding: "12px 16px", marginBottom: 12 }}>
          <div
            style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr", gap: 10, alignItems: "end" }}
          >
            <Field
              label={t("out.filter.search")}
              value={query}
              onChange={setQuery}
              placeholder="Nakoda / M9825…"
            />
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
            <Field
              label={t("out.filter.min")}
              value={minAmt}
              onChange={(v) => setMinAmt(v.replace(/[^\d]/g, ""))}
              inputMode="numeric"
            />
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
            <Segmented
              options={[
                { value: "amount", label: t("out.sort.amount") },
                { value: "name", label: t("out.sort.name") },
              ]}
              value={sortBy}
              onChange={(v) => setSortBy(v as "amount" | "name")}
            />
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
          {filtered.map((r) => (
            <OutItem
              key={r.id}
              r={r}
              accountId={accountId}
              accountName={activeName}
              onAdjusted={() => {
                setToast({ msg: t("out.adjust.done"), kind: "ok" });
                router.refresh();
              }}
            />
          ))}
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
