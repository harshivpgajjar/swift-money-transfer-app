"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";
import { formatShortDate } from "@/lib/format";
import { formatINR } from "@/lib/utils";
import { Empty, Icon } from "@/lib/ui";
import type { LateChargeRow } from "@/lib/queries";

function Section({
  label,
  color,
  rows,
  retailerLbl,
  basisLbl,
  chargeLbl,
}: {
  label: string;
  color: string;
  rows: LateChargeRow[];
  retailerLbl: string;
  basisLbl: string;
  chargeLbl: string;
}) {
  if (rows.length === 0) return null;
  const sum = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 16, paddingTop: 10, borderTop: "0.5px solid var(--border-2)" }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: color }} />
        <span style={{ flex: 1, fontSize: 11, color, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</span>
        <span className="mono" style={{ fontSize: 12.5, color }}>{formatINR(sum)}</span>
      </div>
      <div style={{ display: "flex", padding: "8px 0 2px", fontSize: 10.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".04em" }}>
        <span style={{ flex: 1 }}>{retailerLbl}</span>
        <span style={{ width: 96, textAlign: "right" }}>{basisLbl}</span>
        <span style={{ width: 80, textAlign: "right" }}>{chargeLbl}</span>
      </div>
      {rows.map((r, i) => (
        <div
          key={`${r.retailer_id}-${r.account_name}-${i}`}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: "0.5px solid var(--border)" }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.full_name}</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{r.account_name}</div>
          </div>
          <span className="mono" style={{ width: 96, textAlign: "right", fontSize: 13, color: "var(--ink-2)" }}>{formatINR(r.basis)}</span>
          <span className="mono" style={{ width: 80, textAlign: "right", fontSize: 14, fontWeight: 500, color: "var(--neg)" }}>{formatINR(r.amount)}</span>
        </div>
      ))}
    </>
  );
}

export default function LateChargesView({
  date,
  prev,
  next,
  rows,
  runDay,
}: {
  date: string;
  prev: string;
  next: string;
  rows: LateChargeRow[];
  runDay: (formData: FormData) => void;
}) {
  const { t } = useT();
  const attention = rows.filter((r) => r.bucket === "attention");
  const atrisk = rows.filter((r) => r.bucket === "atrisk");
  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <div style={{ maxWidth: 640 }}>
      <p className="lead" style={{ marginTop: 0 }}>
        {t("lc.total")} <b style={{ color: "var(--neg)" }}>{formatINR(total)}</b> · {formatShortDate(date)}
      </p>
      <p style={{ marginTop: -6, fontSize: 12, color: "var(--ink-3)" }}>{t("lc.sub")} · {t("lc.rule")}</p>

      <div className="card" style={{ padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <Link href={`/distributor/late-charges?date=${prev}`} className="btn-soft" style={{ width: 32, height: 32, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center" }} aria-label="Previous day">
          <Icon name="arrowL" size={16} />
        </Link>
        <div style={{ flex: 1, textAlign: "center", fontSize: 14, fontWeight: 500 }}>{formatShortDate(date)}</div>
        <Link href={`/distributor/late-charges?date=${next}`} className="btn-soft" style={{ width: 32, height: 32, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center" }} aria-label="Next day">
          <Icon name="chev" size={16} />
        </Link>
        <form action={runDay}>
          <input type="hidden" name="date" value={date} />
          <button type="submit" className="btn-soft" style={{ fontSize: 12.5, padding: "7px 12px", borderRadius: 8 }}>{t("lc.run")}</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <Empty icon="check" title={t("lc.empty")} />
      ) : (
        <div className="card" style={{ padding: "4px 16px 12px" }}>
          <Section label={t("lc.attention")} color="var(--neg)" rows={attention} retailerLbl={t("lc.col.retailer")} basisLbl={t("lc.col.basis")} chargeLbl={t("lc.col.charge")} />
          <Section label={t("lc.atrisk")} color="var(--warn)" rows={atrisk} retailerLbl={t("lc.col.retailer")} basisLbl={t("lc.col.basis")} chargeLbl={t("lc.col.charge")} />
        </div>
      )}
    </div>
  );
}
