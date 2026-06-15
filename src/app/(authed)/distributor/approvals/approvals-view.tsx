"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { distributorDecideRequest } from "@/lib/actions/requests";
import { useT, fmt } from "@/lib/i18n";
import { formatShortDate, formatShortDateTime } from "@/lib/format";
import type { ApprovalStatus } from "@/lib/types";
import { formatINR } from "@/lib/utils";
import { Btn, Empty, Field, Icon, SectionLabel, Toast, type ToastMsg } from "@/lib/ui";

type ReqItem = {
  id: string;
  retailerName: string;
  retailerCode: string;
  account: string;
  fosEdited: boolean;
  fosName: string;
  submitted: string;
  amount: number;
  requested: number;
  note: string | null;
  awaitingFos?: boolean;
};

type CashHistoryItem = {
  id: string;
  retailerName: string;
  retailerCode: string;
  account: string;
  by: string;
  amount: number;
  txn: string;
  submitted: string;
  status: ApprovalStatus;
};

type Resolver = (
  id: string,
  kind: "approve" | "decline",
  amount: number,
  notes: string,
) => Promise<string | null>;

function ApprRequestCard({ item, onResolve }: { item: ReqItem; onResolve: Resolver }) {
  const { t } = useT();
  const [approveAs, setApproveAs] = useState(String(item.amount));
  const [notes, setNotes] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const edited = Number(approveAs) !== item.amount;

  const act = async (kind: "approve" | "decline") => {
    setErr("");
    setBusy(kind);
    const error = await onResolve(item.id, kind, Number(approveAs), notes);
    if (error) {
      setErr(error);
      setBusy(null);
      return;
    }
    setLeaving(true);
  };

  return (
    <div className={"card appr" + (leaving ? " leaving" : "")}>
      <div className="appr-head">
        <div>
          <div className="appr-name">{item.retailerName}</div>
          <div className="appr-code">{item.retailerCode}</div>
        </div>
        <span className="appr-acct">{item.account}</span>
      </div>
      <div className="appr-meta">
        <span
          className={"badge " + (item.awaitingFos ? "warn" : item.fosEdited ? "warn" : "ok")}
          style={{ marginRight: 6 }}
        >
          {item.awaitingFos
            ? t("appr.awaiting_fos")
            : item.fosEdited
              ? t("appr.fos_edited")
              : t("appr.fos_accepted")}
        </span>
        {item.fosName} · {formatShortDateTime(item.submitted)}
      </div>
      <div className="appr-amtrow">
        <span className="appr-amt">{formatINR(item.amount)}</span>
        {item.amount !== item.requested && (
          <span className="appr-orig">{formatINR(item.requested)}</span>
        )}
      </div>
      {item.note && (
        <div className="appr-note">
          <b>{t("appr.fos_note")}:</b> {item.note}
        </div>
      )}
      <div className="appr-edit">
        <Field
          label={t("appr.approve_as")}
          value={approveAs}
          onChange={(v) => setApproveAs(v.replace(/[^\d]/g, ""))}
          inputMode="numeric"
          prefix="₹"
        />
        <Field
          label={t("appr.notes")}
          value={notes}
          onChange={setNotes}
          placeholder={t("appr.notes.ph")}
        />
      </div>
      {err && (
        <div className="inline-err">
          <Icon name="bell" size={15} w={2.2} />
          {err}
        </div>
      )}
      <div className="appr-actions two">
        <Btn
          variant="danger"
          onClick={() => act("decline")}
          busy={busy === "decline"}
          busyLabel="…"
        >
          {t("appr.decline")}
        </Btn>
        <Btn
          variant="primary"
          onClick={() => act("approve")}
          busy={busy === "approve"}
          busyLabel="…"
          disabled={!Number(approveAs)}
        >
          {edited ? t("appr.approve_edited") : t("appr.approve")}
        </Btn>
      </div>
    </div>
  );
}

export default function ApprovalsView({
  requests,
  fosPending = [],
  cashHistory,
}: {
  requests: ReqItem[];
  fosPending?: ReqItem[];
  cashHistory: CashHistoryItem[];
}) {
  const { t } = useT();
  const router = useRouter();
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<ToastMsg>(null);
  const [, start] = useTransition();

  const makeResolver =
    (): Resolver =>
    async (id, kind, amount, notes) => {
      const fd = new FormData();
      fd.set("request_id", id);
      fd.set("decision", kind);
      if (kind === "approve") fd.set("amount", String(amount));
      if (notes) fd.set("notes", notes);
      const r = await distributorDecideRequest(fd);
      if ("error" in r) return r.error;
      setTimeout(() => {
        setResolved((s) => new Set(s).add(id));
        setToast({
          msg: kind === "decline" ? t("badge.declined") : t("badge.approved"),
          kind: kind === "decline" ? "neg" : "ok",
        });
        start(() => router.refresh());
      }, 350);
      return null;
    };

  const visReq = requests.filter((r) => !resolved.has(r.id));
  const visFosPending = fosPending.filter((r) => !resolved.has(r.id));

  return (
    <div>
      <SectionLabel style={{ marginTop: 4 }}>
        {fmt(t("appr.requests"), { n: visReq.length })}
      </SectionLabel>
      <div className="web-appr-grid">
        {visReq.map((it) => (
          <ApprRequestCard key={it.id} item={it} onResolve={makeResolver()} />
        ))}
      </div>
      {visReq.length === 0 && (
        <Empty
          icon="check"
          title={t("appr.empty.req.title")}
          sub={t("appr.empty.req.sub")}
        />
      )}

      {visFosPending.length > 0 && (
        <>
          <SectionLabel>{fmt(t("appr.fos_pending"), { n: visFosPending.length })}</SectionLabel>
          <p className="fmt-list" style={{ margin: "0 4px 12px" }}>{t("appr.fos_pending.note")}</p>
          <div className="web-appr-grid">
            {visFosPending.map((it) => (
              <ApprRequestCard key={it.id} item={it} onResolve={makeResolver()} />
            ))}
          </div>
        </>
      )}

      <SectionLabel>{fmt(t("dist.cash_live"), { n: cashHistory.length })}</SectionLabel>
      <p className="fmt-list" style={{ margin: "0 4px 12px" }}>{t("dist.cash_live.note")}</p>
      {cashHistory.length ? (
        cashHistory.map((c) => {
          const tone =
            c.status === "approved" ? "ok" : c.status === "declined" ? "neg" : "warn";
          const label =
            c.status === "approved"
              ? t("badge.approved")
              : c.status === "declined"
                ? t("badge.declined")
                : t("badge.pending");
          return (
            <div className="row" key={c.id}>
              <div className="row-main">
                <div className="row-title">
                  {formatINR(c.amount)}
                  <span className="muted" style={{ fontWeight: 500, fontSize: 12.5 }}>
                    {" "}· {c.retailerCode} {c.retailerName}
                  </span>
                </div>
                <div className="row-sub">
                  {c.account} · {fmt(t("appr.submitted_by"), { name: c.by })} ·{" "}
                  {t("appr.txn")} {formatShortDate(c.txn)} · {formatShortDateTime(c.submitted)}
                </div>
              </div>
              <span className={"badge " + tone}>{label}</span>
            </div>
          );
        })
      ) : (
        <Empty icon="cash" title={t("appr.empty.cash.title")} />
      )}

      <Toast msg={toast?.msg} kind={toast?.kind} onDone={() => setToast(null)} />
    </div>
  );
}
