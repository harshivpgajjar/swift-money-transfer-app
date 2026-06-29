"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useT, fmt } from "@/lib/i18n";
import { formatShortDate, formatShortDateTime, kShort } from "@/lib/format";
import { formatINR } from "@/lib/utils";
import { Empty, Segmented, SectionLabel } from "@/lib/ui";
import type { RequestFosStatus, ApprovalStatus, EodTxnType } from "@/lib/types";

type DailyRow = {
  date: string;
  opening: number;
  transferred: number;
  reversed: number;
  cash: number;
  closing: number;
};
type ReqItem = {
  id: string;
  amount: number;
  requested: number;
  adjusted: boolean;
  createdAt: string;
  fosStatus: RequestFosStatus;
  distStatus: ApprovalStatus;
};
type CashItem = {
  id: string;
  amount: number;
  txnDate: string;
  createdAt: string;
  status: ApprovalStatus;
};
type EodItem = {
  id: string;
  date: string;
  type: EodTxnType;
  amount: number;
  ref: string | null;
};

export default function HistoryView({
  accounts,
  activeSlug,
  preset,
  from,
  to,
  daily,
  requests,
  cash,
  eod,
}: {
  accounts: { id: string; slug: string; name: string }[];
  activeSlug: string;
  preset: string;
  from: string;
  to: string;
  daily: DailyRow[];
  requests: ReqItem[];
  cash: CashItem[];
  eod: EodItem[];
}) {
  const { t } = useT();
  const router = useRouter();

  const [customFrom, setCustomFrom] = useState(preset === "custom" ? from : "");
  const [customTo, setCustomTo] = useState(preset === "custom" ? to : "");

  // Build a statement URL preserving the chosen account.
  const go = (params: { range?: string; from?: string; to?: string }) => {
    const qs = new URLSearchParams({ account: activeSlug });
    if (params.range) qs.set("range", params.range);
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    router.replace(`/retailer/history?${qs.toString()}`, { scroll: false });
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

  const fosBadge = (s: RequestFosStatus) =>
    s === "pending"
      ? { k: "warn", t: t("badge.pending") }
      : s === "accepted"
        ? { k: "ok", t: t("badge.accepted") }
        : s === "edited"
          ? { k: "ok", t: t("badge.fos_edited") }
          : { k: "neg", t: t("badge.declined") };

  const distBadge = (fos: RequestFosStatus, dist: ApprovalStatus) => {
    if (fos === "declined") return { k: "mute", t: "—" };
    if (fos === "pending") return { k: "mute", t: t("badge.awaiting_fos") };
    if (dist === "approved") return { k: "ok", t: t("badge.approved") };
    if (dist === "declined") return { k: "neg", t: t("badge.declined") };
    return { k: "warn", t: t("badge.pending") };
  };

  const cashBadge = (s: ApprovalStatus) =>
    s === "approved"
      ? { k: "ok", t: t("badge.approved") }
      : s === "declined"
        ? { k: "neg", t: t("badge.declined") }
        : { k: "warn", t: t("badge.pending") };

  return (
    <div>
      <Segmented
        options={accounts.map((a) => ({ value: a.slug, label: a.name }))}
        value={activeSlug}
        onChange={(slug) => {
          const qs = new URLSearchParams({ account: slug, range: preset });
          if (preset === "custom") {
            qs.set("from", from);
            qs.set("to", to);
          }
          router.replace(`/retailer/history?${qs.toString()}`, { scroll: false });
        }}
      />

      <div className="spacer" />
      <div className="card" style={{ padding: "12px 16px" }}>
        <Segmented
          options={[
            { value: "1d", label: t("hist.range.yesterday") },
            { value: "7d", label: t("hist.range.7d") },
            { value: "30d", label: t("hist.range.30d") },
            { value: "all", label: t("hist.range.all") },
          ]}
          value={preset === "custom" ? "" : preset}
          onChange={(r) => go({ range: r })}
        />
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
                if (e.target.value && customTo) go({ range: "custom", from: e.target.value, to: customTo });
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
                if (customFrom && e.target.value) go({ range: "custom", from: customFrom, to: e.target.value });
              }}
            />
          </label>
        </div>
      </div>

      <SectionLabel>{t("history.daily")}</SectionLabel>
      <div className="card" style={{ padding: "8px 16px 4px" }}>
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
            {daily.map((d) => (
              <tr key={d.date}>
                <td>{formatShortDate(d.date)}</td>
                <td>{kShort(d.opening)}</td>
                <td className="pos">{d.transferred ? "+" + kShort(d.transferred) : "—"}</td>
                <td className="neg">{d.reversed ? "−" + kShort(d.reversed) : "—"}</td>
                <td className="neg">{d.cash ? "−" + kShort(d.cash) : "—"}</td>
                <td className="close">{kShort(d.closing, 1)}</td>
              </tr>
            ))}
            {daily.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "var(--ink-3)" }}>
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <SectionLabel>{fmt(t("history.requests"), { n: requests.length })}</SectionLabel>
      {requests.length ? (
        requests.map((r) => {
          const fb = fosBadge(r.fosStatus);
          const db = distBadge(r.fosStatus, r.distStatus);
          return (
            <div className="row" key={r.id}>
              <div className="row-main">
                <div className="row-title">
                  {formatINR(r.amount)}
                  {r.adjusted ? (
                    <span className="muted" style={{ fontWeight: 500, fontSize: 12.5 }}>
                      {" "}
                      · {fmt(t("history.adjusted"), { orig: formatINR(r.requested) })}
                    </span>
                  ) : null}
                </div>
                <div className="row-sub">{formatShortDateTime(r.createdAt)}</div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                  alignItems: "flex-end",
                }}
              >
                <span className={"badge " + fb.k}>{fb.t}</span>
                <span className={"badge " + db.k}>{db.t}</span>
              </div>
            </div>
          );
        })
      ) : (
        <Empty icon="send" title={t("history.empty.req")} />
      )}

      <SectionLabel>{fmt(t("history.cash"), { n: cash.length })}</SectionLabel>
      {cash.length ? (
        cash.map((c) => {
          const b = cashBadge(c.status);
          return (
            <div className="row" key={c.id}>
              <div className="row-main">
                <div className="row-title">{formatINR(c.amount)}</div>
                <div className="row-sub">
                  {t("history.txn")} {formatShortDate(c.txnDate)} · {t("history.submitted")}{" "}
                  {formatShortDateTime(c.createdAt)}
                </div>
              </div>
              <span className={"badge " + b.k}>{b.t}</span>
            </div>
          );
        })
      ) : (
        <Empty icon="cash" title={t("history.empty.cash")} />
      )}

      <SectionLabel>{fmt(t("history.eod"), { n: eod.length })}</SectionLabel>
      <div className="card" style={{ padding: "8px 16px 4px" }}>
        <table className="dtable">
          <thead>
            <tr>
              <th>{t("out.col.date")}</th>
              <th>{t("history.col.type")}</th>
              <th>{t("history.col.amount")}</th>
              <th>{t("history.col.ref")}</th>
            </tr>
          </thead>
          <tbody>
            {eod.map((e) => (
              <tr key={e.id}>
                <td>{formatShortDate(e.date)}</td>
                <td
                  style={{
                    fontFamily: "var(--font-ui)",
                    color: e.type === "reversal" ? "var(--neg)" : "var(--pos)",
                    fontWeight: 600,
                  }}
                >
                  {e.type}
                </td>
                <td className={e.type === "reversal" ? "neg" : "pos"}>
                  {e.type === "reversal" ? "−" : "+"}
                  {formatINR(e.amount, false)}
                </td>
                <td style={{ color: "var(--ink-3)", fontSize: 12 }}>{e.ref ?? "—"}</td>
              </tr>
            ))}
            {eod.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", color: "var(--ink-3)" }}>
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
