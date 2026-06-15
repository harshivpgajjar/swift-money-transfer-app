"use client";

import { useT, fmt } from "@/lib/i18n";
import { formatINR } from "@/lib/utils";
import { formatShortDate } from "@/lib/format";
import { Icon, SectionLabel } from "@/lib/ui";
import DistributorActivity from "@/components/distributor-activity";
import type { AnalyticsData } from "@/lib/analytics";

const BUCKET_COLORS: Record<string, string> = {
  "0-7": "var(--accent)",
  "8-15": "#8FBF6F",
  "16-30": "var(--warn)",
  "30+": "var(--neg)",
};

function Mini({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="out-mini">
      <div className="out-mini-l">{label}</div>
      <div className={"out-mini-v" + (tone ? " " + tone : "")}>{value}</div>
    </div>
  );
}

export default function AnalyticsView({ data }: { data: AnalyticsData }) {
  const { t } = useT();
  const { pulse, outstanding, aging, slowPayers, fos, recon, alerts, discrepancies } = data;

  const agingTotal = aging.buckets.reduce((s, b) => s + b.amount, 0);
  const alertCount =
    alerts.staleRequests.length +
    alerts.staleCash.length +
    alerts.noPayment14d.length +
    (alerts.neverLoggedIn > 0 ? 1 : 0);

  /* sparkline points for the 30d series */
  const series = outstanding.series;
  const min = Math.min(...series.map((p) => p.total));
  const max = Math.max(...series.map((p) => p.total));
  const range = max - min || 1;
  const points = series
    .map((p, i) => {
      const x = (i / (series.length - 1)) * 300;
      const y = 56 - 8 - ((p.total - min) / range) * 40;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div>
      {/* ---- live activity feed ---- */}
      <SectionLabel style={{ marginTop: 4 }}>{t("act.title")}</SectionLabel>
      <p className="fmt-list" style={{ margin: "0 4px 12px" }}>{t("act.note")}</p>
      <DistributorActivity />

      {/* ---- daily pulse ---- */}
      <SectionLabel>{t("an.today")}</SectionLabel>
      <div className="card" style={{ padding: 14 }}>
        <div className="out-detail-grid" style={{ margin: 0 }}>
          <Mini label={t("an.disbursed")} value={formatINR(pulse.today.disbursed)} tone="neg" />
          <Mini label={t("an.collected")} value={formatINR(pulse.today.collected)} tone="pos" />
          <Mini
            label={t("an.net")}
            value={(pulse.today.net > 0 ? "+" : "") + formatINR(pulse.today.net)}
            tone={pulse.today.net > 0 ? "neg" : "pos"}
          />
          <Mini
            label={t("an.yesterday") + " · " + t("an.net")}
            value={(pulse.yesterday.net > 0 ? "+" : "") + formatINR(pulse.yesterday.net)}
          />
        </div>
      </div>

      {/* ---- health: recon + alerts ---- */}
      <SectionLabel>
        {alertCount ? fmt(t("an.alerts"), { n: alertCount }) : t("an.all_clear")}
      </SectionLabel>
      <div className="card" style={{ padding: 14 }}>
        <div
          className="row"
          style={{ marginBottom: alertCount ? 10 : 0, background: "var(--surface-2)", border: "none" }}
        >
          <span
            className="tile-ic"
            style={{
              width: 34,
              height: 34,
              background: recon.matched
                ? "var(--accent-soft)"
                : "color-mix(in srgb, var(--warn) 16%, transparent)",
              color: recon.matched ? "var(--accent-ink)" : "var(--warn)",
            }}
          >
            <Icon name={recon.matched ? "check" : "bell"} size={17} />
          </span>
          <div className="row-main">
            <div className="row-title" style={{ fontSize: 14.5 }}>
              {recon.matched
                ? t("an.recon_ok")
                : fmt(t("an.recon_diff"), {
                    amt: recon.diffAmount.toLocaleString("en-IN"),
                    n: recon.diffPairs,
                  })}
            </div>
            {recon.unmatchedEod > 0 && (
              <div className="row-sub">{fmt(t("an.unmatched_eod"), { n: recon.unmatchedEod })}</div>
            )}
          </div>
          <span className={"badge " + (recon.matched && recon.unmatchedEod === 0 ? "ok" : "warn")}>
            {recon.matched && recon.unmatchedEod === 0 ? "✓" : "!"}
          </span>
        </div>

        {alerts.staleRequests.map((a, i) => (
          <div className="kv" key={"sr" + i}>
            <span className="kv-l">
              {a.retailer} · {fmt(t("an.alert.req_stale"), { h: a.hours, fos: a.fos })}
            </span>
            <span className="kv-v mono">{formatINR(a.amount)}</span>
          </div>
        ))}
        {alerts.staleCash.map((a, i) => (
          <div className="kv" key={"sc" + i}>
            <span className="kv-l">
              {a.retailer} · {fmt(t("an.alert.cash_stale"), { h: a.hours })}
            </span>
            <span className="kv-v mono">{formatINR(a.amount)}</span>
          </div>
        ))}
        {alerts.noPayment14d.map((a, i) => (
          <div className="kv" key={"np" + i}>
            <span className="kv-l">
              {a.name} · {t("an.alert.no_payment")}
            </span>
            <span className="kv-v mono">{formatINR(a.outstanding)}</span>
          </div>
        ))}
        {alerts.neverLoggedIn > 0 && (
          <div className="kv">
            <span className="kv-l">{fmt(t("an.alert.never_logged"), { n: alerts.neverLoggedIn })}</span>
            <span className="kv-v" />
          </div>
        )}
      </div>

      {/* ---- amount discrepancies ---- */}
      <SectionLabel>
        {fmt(t("an.disc"), {
          n: discrepancies.requests.length + discrepancies.cash.length,
        })}
      </SectionLabel>
      <div className="card" style={{ padding: "6px 16px" }}>
        <p className="fmt-list" style={{ margin: "10px 0 4px" }}>{t("an.disc.note")}</p>
        {discrepancies.requests.map((d, i) => (
          <div className="kv" key={"dr" + i}>
            <span className="kv-l">
              {d.retailer}
              <span className="muted" style={{ fontSize: 12 }}>
                {" "}· {formatShortDate(d.date)} ·{" "}
                {fmt(t("an.disc.req_chain"), {
                  x: formatINR(d.requested),
                  y: d.fosAmount !== null ? formatINR(d.fosAmount) : "—",
                  z: formatINR(d.final),
                })}
              </span>
            </span>
            <span
              className="kv-v mono"
              style={{ color: d.final < d.requested ? "var(--neg)" : "var(--pos)" }}
            >
              {d.final - d.requested > 0 ? "+" : ""}
              {formatINR(d.final - d.requested)}
            </span>
          </div>
        ))}
        {discrepancies.cash.map((d, i) => (
          <div className="kv" key={"dc" + i}>
            <span className="kv-l">
              {d.retailer}
              {d.declined && (
                <span className="badge neg" style={{ marginLeft: 6 }}>
                  {t("an.disc.declined")}
                </span>
              )}
              <span className="muted" style={{ fontSize: 12 }}>
                {" "}· {formatShortDate(d.date)} ·{" "}
                {fmt(t("an.disc.cash_chain"), {
                  x: formatINR(d.claimed),
                  y: formatINR(d.received),
                })}
              </span>
            </span>
            <span className="kv-v mono" style={{ color: "var(--neg)" }}>
              {formatINR(d.received - d.claimed)}
            </span>
          </div>
        ))}
        {discrepancies.requests.length + discrepancies.cash.length === 0 && (
          <p className="fmt-list" style={{ margin: "4px 0 12px", color: "var(--pos)" }}>
            {t("an.disc.none")}
          </p>
        )}
      </div>

      {/* ---- not using the app (portal transfers without app requests) ---- */}
      <SectionLabel>{fmt(t("an.appuse"), { n: data.appUsage.length })}</SectionLabel>
      <div className="card" style={{ padding: "6px 16px" }}>
        <p className="fmt-list" style={{ margin: "10px 0 4px" }}>{t("an.appuse.note")}</p>
        {data.appUsage.map((u, i) => (
          <div className="kv" key={"au" + i}>
            <span className="kv-l">
              {u.name}
              <span className="muted" style={{ fontSize: 12 }}>
                {" "}· {u.code} · {fmt(t("an.appuse.count"), { n: u.transfers })}
              </span>
            </span>
            <span className="kv-v mono">{formatINR(u.amount)}</span>
          </div>
        ))}
        {data.appUsage.length === 0 && (
          <p className="fmt-list" style={{ margin: "4px 0 12px", color: "var(--pos)" }}>
            {t("an.appuse.none")}
          </p>
        )}
      </div>

      {/* ---- 30-day trend + account split ---- */}
      <SectionLabel>{t("an.trend_30d")}</SectionLabel>
      <div className="card" style={{ padding: "16px 18px" }}>
        <svg width="100%" height="56" viewBox="0 0 300 56" preserveAspectRatio="none">
          <polyline
            points={points}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="divider" style={{ margin: "12px 0" }} />
        <div className="out-detail-grid" style={{ margin: 0, gridTemplateColumns: `repeat(${outstanding.byAccount.length + 1}, 1fr)` }}>
          <Mini label={t("dist.tile.outstanding")} value={formatINR(outstanding.total)} />
          {outstanding.byAccount.map((a) => (
            <Mini key={a.id} label={a.name} value={formatINR(a.amount)} />
          ))}
        </div>
      </div>

      {/* ---- aging ---- */}
      <SectionLabel>{t("an.aging")}</SectionLabel>
      <div className="card" style={{ padding: 16 }}>
        {agingTotal > 0 && (
          <div style={{ display: "flex", height: 14, borderRadius: 999, overflow: "hidden", marginBottom: 12 }}>
            {aging.buckets.map(
              (b) =>
                b.amount > 0 && (
                  <div
                    key={b.label}
                    style={{
                      width: `${(b.amount / agingTotal) * 100}%`,
                      background: BUCKET_COLORS[b.label],
                    }}
                  />
                ),
            )}
          </div>
        )}
        <div className="out-detail-grid" style={{ margin: 0 }}>
          {aging.buckets.map((b) => (
            <div className="out-mini" key={b.label}>
              <div className="out-mini-l" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: BUCKET_COLORS[b.label],
                    display: "inline-block",
                  }}
                />
                {b.label} {t("an.days_lbl")}
              </div>
              <div className="out-mini-v">{formatINR(b.amount)}</div>
            </div>
          ))}
        </div>
        {aging.topOverdue.length > 0 && (
          <>
            <div className="divider" />
            <div className="out-mini-l" style={{ marginBottom: 6 }}>{t("an.top_overdue")}</div>
            {aging.topOverdue.map((r, i) => (
              <div className="kv" key={i}>
                <span className="kv-l">
                  {r.name}{" "}
                  <span className={"badge " + (r.days > 30 ? "neg" : r.days > 15 ? "warn" : "mute")}>
                    {r.days} {t("an.days_lbl")}
                  </span>
                </span>
                <span className="kv-v mono">{formatINR(r.amount)}</span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ---- slow payers ---- */}
      {slowPayers.length > 0 && (
        <>
          <SectionLabel>{t("an.slow_payers")}</SectionLabel>
          <div className="card" style={{ padding: "6px 16px" }}>
            {slowPayers.map((r, i) => (
              <div className="kv" key={i}>
                <span className="kv-l">
                  {r.name}
                  {r.avgDays !== null && (
                    <span className="muted" style={{ fontSize: 12 }}>
                      {" "}· {fmt(t("an.avg_clear"), { n: r.avgDays })}
                    </span>
                  )}
                </span>
                <span className="kv-v mono">{formatINR(r.outstanding)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ---- FOS scorecards ---- */}
      <SectionLabel>{t("an.fos_perf")}</SectionLabel>
      <div className="tiles" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        {fos.map((f) => (
          <div className="card" key={f.name} style={{ padding: 16 }}>
            <div className="appr-head" style={{ marginBottom: 10 }}>
              <div className="appr-name" style={{ fontSize: 15 }}>{f.name}</div>
              {(f.pendingRequests > 0 || f.pendingCash > 0) && (
                <span className="badge warn">
                  {t("an.pending_items")} {f.pendingRequests + f.pendingCash}
                </span>
              )}
            </div>
            <div className="kv">
              <span className="kv-l">{t("nav.outstanding")}</span>
              <span className="kv-v mono">{formatINR(f.outstanding)}</span>
            </div>
            <div className="kv">
              <span className="kv-l">{t("an.collected_7d")}</span>
              <span className="kv-v mono" style={{ color: "var(--pos)" }}>
                {formatINR(f.collected7d)}
              </span>
            </div>
            <div className="kv">
              <span className="kv-l">{t("an.avg_response")}</span>
              <span className="kv-v mono">
                {f.avgResponseHours !== null ? `${f.avgResponseHours}h` : "—"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
