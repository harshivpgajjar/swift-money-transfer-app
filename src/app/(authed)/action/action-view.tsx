"use client";

import { useState } from "react";
import { useT, fmt } from "@/lib/i18n";
import { formatShortDate } from "@/lib/format";
import { formatINR } from "@/lib/utils";
import { Empty, Icon, Selectt } from "@/lib/ui";
import type { ActionRow } from "@/lib/queries";

// Three display groups, in order: active chase → at-risk → blocked.
type Group = "active" | "atrisk" | "blocked";
function groupOf(b: ActionRow["bucket"]): Group {
  if (b === "defaulter") return "blocked";
  if (b === "atrisk") return "atrisk";
  return "active"; // attention + alert
}

function Rows({ rows, muted }: { rows: ActionRow[]; muted: boolean }) {
  return (
    <>
      {rows.map((r) => (
        <div
          key={r.retailer_id}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderBottom: "0.5px solid var(--border)" }}
        >
          <div style={{ flex: 1, minWidth: 0, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {r.full_name}
          </div>
          <span className="mono" style={{ width: 96, textAlign: "right", fontSize: 14, fontWeight: 500, color: muted ? "var(--ink-2)" : "var(--neg)" }}>
            {formatINR(r.outstanding)}
          </span>
          <span className="mono" style={{ width: 84, textAlign: "right", fontSize: 12.5, color: "var(--ink-3)" }}>
            {formatINR(r.full_pending)}
          </span>
          <span style={{ width: 40, textAlign: "right" }}>
            {r.phone ? (
              <a
                href={`tel:${r.phone}`}
                aria-label={`Call ${r.full_name}`}
                className="btn-soft"
                style={{ width: 32, height: 32, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                <Icon name="phone" size={15} />
              </a>
            ) : null}
          </span>
        </div>
      ))}
    </>
  );
}

function GroupHeader({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 16, paddingTop: 10, borderTop: "0.5px solid var(--border-2)" }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: color }} />
      <span style={{ fontSize: 11, color, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</span>
    </div>
  );
}

export default function ActionCenterView({
  rows,
  fosOptions,
}: {
  rows: ActionRow[];
  fosOptions?: { id: string; name: string }[];
}) {
  const { t } = useT();
  const [fos, setFos] = useState("__all__");
  const refDay = rows[0]?.ref_day;

  const visible = rows.filter((r) =>
    fos === "__all__" ? true : fos === "__none__" ? !r.fos_id : r.fos_id === fos,
  );
  const byAmt = (a: ActionRow, b: ActionRow) => b.outstanding - a.outstanding;
  const active = visible.filter((r) => groupOf(r.bucket) === "active").sort(byAmt);
  const atrisk = visible.filter((r) => groupOf(r.bucket) === "atrisk").sort(byAmt);
  const blocked = visible.filter((r) => groupOf(r.bucket) === "blocked").sort(byAmt);
  const total3pm = visible.reduce((s, r) => s + r.outstanding, 0);

  return (
    <div style={{ maxWidth: 640 }}>
      <p className="lead" style={{ marginTop: 0 }}>
        {t("act.head")} <b style={{ color: "var(--neg)" }}>{formatINR(total3pm)}</b>
        {refDay ? ` · ${fmt(t("act.asof"), { date: formatShortDate(refDay) })}` : ""}
      </p>

      {fosOptions && fosOptions.length > 0 && (
        <div className="card" style={{ padding: "12px 16px", marginBottom: 12 }}>
          <Selectt
            label={t("out.filter.fos")}
            value={fos}
            onChange={setFos}
            options={[
              { value: "__all__", label: t("out.filter.all_fos") },
              ...fosOptions.map((f) => ({ value: f.id, label: f.name })),
              { value: "__none__", label: t("out.filter.unassigned") },
            ]}
          />
        </div>
      )}

      {visible.length === 0 ? (
        <Empty icon="check" title={t("act.allclear")} />
      ) : (
        <div className="card" style={{ padding: "4px 16px 12px" }}>
          <div style={{ display: "flex", padding: "8px 0 2px", fontSize: 10.5, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: ".04em" }}>
            <span style={{ flex: 1 }}>{t("act.col.retailer")}</span>
            <span style={{ width: 96, textAlign: "right" }}>{t("act.col.till")}</span>
            <span style={{ width: 84, textAlign: "right" }}>{t("act.col.full")}</span>
            <span style={{ width: 40 }} />
          </div>
          {active.length > 0 && <Rows rows={active} muted={false} />}
          {atrisk.length > 0 && (
            <>
              <GroupHeader color="var(--warn)" label={`${t("act.atrisk")} · ${t("act.atrisk.sub")}`} />
              <Rows rows={atrisk} muted />
            </>
          )}
          {blocked.length > 0 && (
            <>
              <GroupHeader color="var(--ink-3)" label={`${t("act.blocked")} · ${t("act.defaulters.sub")}`} />
              <Rows rows={blocked} muted />
            </>
          )}
        </div>
      )}
    </div>
  );
}
